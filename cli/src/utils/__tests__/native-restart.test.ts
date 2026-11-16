import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTempDir, makeResource } from "../../test-support/index.js";
import {
  NativeSupervisor,
  nativeLogPath,
  planNativeRun,
  readNativeRunState,
  requestNativeRestart,
} from "../native-runtime.js";
import { withFailureLogs } from "../native-up.js";

const NODE = JSON.stringify(process.execPath);
const SERVER = `import { createServer } from "node:http";
createServer((req, res) => { res.writeHead(req.url === "/health" ? 200 : 404); res.end(process.env.GREETING ?? ""); })
  .listen(Number(process.env.PORT), () => console.log("listening " + process.env.PORT));`;

function service(dir: string, name: string, config: Record<string, unknown>) {
  const resource = makeResource(name, "bring-your-own", config);
  return { ...resource, path: dir, configPath: join(dir, "service.json") };
}
function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer().listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

const supervisors: NativeSupervisor[] = [];
afterEach(async () => {
  await Promise.all(supervisors.splice(0).map((s) => s.stop()));
});

async function twoServices(
  root: string,
  options: ConstructorParameters<typeof NativeSupervisor>[3] = {},
) {
  const [apiPort, webPort] = [await freePort(), await freePort()];
  for (const name of ["api", "web"]) {
    mkdirSync(join(root, name), { recursive: true });
    writeFileSync(join(root, name, "server.mjs"), SERVER);
  }
  const plans = (greeting: string) =>
    planNativeRun(
      [
        service(join(root, "api"), "api", {
          command: `${NODE} server.mjs`,
          port: apiPort,
          healthCheckPath: "/health",
          env: { GREETING: greeting },
        }),
        service(join(root, "web"), "web", {
          command: `${NODE} server.mjs`,
          port: webPort,
          healthCheckPath: "/health",
          dependsOn: ["api"],
        }),
      ],
      {},
      root,
    ).services;
  const supervisor = new NativeSupervisor(root, plans("one"), {}, options);
  supervisors.push(supervisor);
  expect(await supervisor.start()).toEqual([]);
  return { supervisor, apiPort, webPort, plans };
}

describe("native resource restart through the control channel", () => {
  it("restarts only the requested service and reports it ready with its new pid", async () => {
    const root = createTempDir();
    const { apiPort, webPort } = await twoServices(root);
    const before = readNativeRunState(root)?.services;
    const result = await requestNativeRestart(root, "api", { waitMs: 20_000 });
    expect(result.state).toBe("ready");
    const after = readNativeRunState(root)?.services;
    expect(after?.api?.pid).toBe((result as { pid?: number }).pid);
    expect(after?.api?.pid).not.toBe(before?.api?.pid);
    expect(after?.web?.pid).toBe(before?.web?.pid);
    expect((await fetch(`http://localhost:${apiPort}/health`)).status).toBe(200);
    expect((await fetch(`http://localhost:${webPort}/health`)).status).toBe(200);
  });

  it("starts again from the reloaded config, so a repaired value takes effect", async () => {
    const root = createTempDir();
    let greeting = "one";
    let plansFor: (g: string) => ReturnType<typeof planNativeRun>["services"] = () => [];
    const { apiPort, plans } = await twoServices(root, {
      reload: () => ({ plans: plansFor(greeting), baseEnv: {} }),
    });
    plansFor = plans;
    expect(await (await fetch(`http://localhost:${apiPort}/`)).text()).toBe("one");
    greeting = "two";
    expect((await requestNativeRestart(root, "api", { waitMs: 20_000 })).state).toBe("ready");
    expect(await (await fetch(`http://localhost:${apiPort}/`)).text()).toBe("two");
  });

  it("reports failed with the cause in the log when the restarted service dies", async () => {
    const root = createTempDir();
    const bad = (plans: ReturnType<typeof planNativeRun>["services"]) =>
      plans.map((p) =>
        p.name === "api"
          ? {
              ...p,
              command: `${NODE} -e "console.error('FATAL: bad config'); process.exit(1)"`,
            }
          : p,
      );
    let plansFor: (g: string) => ReturnType<typeof planNativeRun>["services"] = () => [];
    const { plans } = await twoServices(root, {
      reload: () => ({ plans: bad(plansFor("x")), baseEnv: {} }),
    });
    plansFor = plans;
    const result = await requestNativeRestart(root, "api", { waitMs: 20_000 });
    expect(result.state).toBe("failed");
    const logsSince = (result as { logsSince?: number }).logsSince;
    expect(logsSince).toBeTypeOf("number");
    const [failure] = withFailureLogs(root, [{ name: "api", reason: "x" }], logsSince);
    expect(failure?.logs?.join("\n")).toContain("FATAL: bad config");
  });

  it("says not-running when no supervisor is alive", async () => {
    const root = createTempDir();
    const result = await requestNativeRestart(root, "api", { waitMs: 0 });
    expect(result.state).toBe("not-running");
  });

  it("refuses a service that is not part of the run", async () => {
    const root = createTempDir();
    await twoServices(root);
    const result = await requestNativeRestart(root, "ghost", { waitMs: 5_000 });
    expect(result).toMatchObject({ state: "failed" });
    expect((result as { reason?: string }).reason).toContain("ghost");
  });
});

describe("failure log diagnostics", () => {
  const stamp = (offsetMs: number, text: string) =>
    `${new Date(Date.now() + offsetMs).toISOString()} ${text}`;
  function logOf(root: string, name: string, lines: string[]) {
    mkdirSync(join(root, ".flisk", "native", "logs"), { recursive: true });
    writeFileSync(nativeLogPath(root, name), `${lines.join("\n")}\n`);
  }

  it("leaves a failure without logs when the service has no log file", () => {
    const root = createTempDir();
    expect(withFailureLogs(root, [{ name: "api", reason: "x" }])).toEqual([
      { name: "api", reason: "x" },
    ]);
  });

  it("drops lines from before the start and keeps the new ones", () => {
    const root = createTempDir();
    logOf(root, "api", [stamp(-60_000, "old crash"), stamp(1_000, "new crash")]);
    const [failure] = withFailureLogs(root, [{ name: "api", reason: "x" }], Date.now());
    expect(failure?.logs).toEqual(["new crash"]);
  });

  it("folds a crash loop's repeated line into one with a count", () => {
    const root = createTempDir();
    logOf(root, "api", [
      stamp(1, "cannot connect"),
      stamp(2, "cannot connect"),
      stamp(3, "cannot connect"),
      stamp(4, "gave up"),
    ]);
    const [failure] = withFailureLogs(root, [{ name: "api", reason: "x" }]);
    expect(failure?.logs).toEqual(["cannot connect (x3)", "gave up"]);
  });

  it("caps the lines and the length of each line", () => {
    const root = createTempDir();
    const many = Array.from({ length: 50 }, (_, i) => stamp(i, `line ${i}`));
    logOf(root, "api", [...many, stamp(100, "z".repeat(5000))]);
    const [failure] = withFailureLogs(root, [{ name: "api", reason: "x" }]);
    expect(failure?.logs).toHaveLength(5);
    expect(failure?.logs?.at(-1)?.length).toBeLessThanOrEqual(400);
    expect(failure?.logs?.at(-1)?.endsWith("…")).toBe(true);
    expect(failure?.logs?.[0]).toBe("line 46");
  });
});
