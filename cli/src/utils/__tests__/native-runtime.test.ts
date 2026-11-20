// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTempDir, makeResource } from "../../test-support/index.js";
import { expandEnvValue } from "../env-expand.js";
import {
  dependencyWaves,
  detachesServices,
  findMissingPrograms,
  isNativeRunSupervisorAlive,
  isProcessAlive,
  localUrl,
  NativeSupervisor,
  nativeLogPath,
  nativeRunStatePath,
  nativeServiceStates,
  planNativeRun,
  readNativeLogLines,
  readNativeRunState,
  shellInvocation,
  signalGroup,
  stopNativeRun,
  terminateSupervisorProcess,
} from "../native-runtime.js";
import { withFailureLogs } from "../native-up.js";
import { processStartTime } from "../process-identity.js";

const NODE = JSON.stringify(process.execPath);

describe("native run supervisor identity", () => {
  it("accepts the recorded process and rejects a reused pid", async () => {
    const startTime = await processStartTime(process.pid);
    expect(startTime).toBeDefined();
    const state = {
      pid: process.pid,
      pidStartTime: startTime,
      startedAt: new Date().toISOString(),
      services: {},
    };
    expect(await isNativeRunSupervisorAlive(state)).toBe(true);
    expect(await isNativeRunSupervisorAlive({ ...state, pidStartTime: "reused-pid" })).toBe(false);
  });
});

/** A `${NAME}` (or `${NAME:-fallback}`) reference, written out so it is not mistaken for a template literal. */
const ref = (name: string, fallback?: string) =>
  ["$", "{", name, fallback === undefined ? "" : `:-${fallback}`, "}"].join("");

/** A port the OS just handed out, so parallel test workers never collide on a guessed one. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as { port: number };
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

const SERVER = `
import { createServer } from "node:http";
const port = Number(process.env.PORT);
createServer((req, res) => {
  res.writeHead(req.url === "/health" ? 200 : 404);
  res.end(process.env.GREETING ?? "");
}).listen(port, () => console.log("listening on " + port));
`;

// A database that stays down (port closed, process alive) while a `down` file exists, like Postgres during an outage.
const DB_SCRIPT = `import { createServer } from "node:http";
import { existsSync } from "node:fs";
const serve = () => existsSync("down")
  ? setTimeout(serve, 50)
  : createServer((_req, res) => { res.writeHead(200); res.end(); }).listen(Number(process.env.PORT));
serve();`;

// An API that exits as soon as it cannot reach the database, at start or later: an app with no reconnect logic.
const API_SCRIPT = `import { createServer } from "node:http";
import { connect } from "node:net";
const probe = () => new Promise((resolve) => {
  const socket = connect(Number(process.env.DB_PORT), "127.0.0.1");
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", () => resolve(false));
});
if (!(await probe())) process.exit(1);
createServer((req, res) => { res.writeHead(req.url === "/health" ? 200 : 404); res.end(); }).listen(Number(process.env.PORT));
setInterval(async () => { if (!(await probe())) process.exit(1); }, 50);`;

function nativeService(dir: string, name: string, config: Record<string, unknown>) {
  const resource = makeResource(name, "bring-your-own", config);
  return { ...resource, path: dir, configPath: join(dir, "service.json") };
}

const supervisors: NativeSupervisor[] = [];
afterEach(async () => {
  await Promise.all(supervisors.splice(0).map((supervisor) => supervisor.stop()));
});

function waitFor(condition: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (condition()) resolve();
      else if (Date.now() > deadline) reject(new Error("condition not met in time"));
      else setTimeout(poll, 50);
    };
    poll();
  });
}

describe("native run planning", () => {
  it("expands variable references, with and without a default, and reports unset ones", () => {
    const missing: string[] = [];
    expect(
      expandEnvValue(
        `http://localhost:${ref("API_PORT")}/${ref("NOPE")}${ref("MAYBE", "x")}`,
        { API_PORT: "4000" },
        (n) => missing.push(n),
      ),
    ).toBe("http://localhost:4000/x");
    expect(missing).toEqual(["NOPE"]);
  });

  it("orders services so each starts after what it depends on", () => {
    expect(
      dependencyWaves([
        { name: "web", dependsOn: ["api"] },
        { name: "api", dependsOn: ["db"] },
        { name: "db", dependsOn: [] },
        { name: "worker", dependsOn: ["db"] },
      ]),
    ).toEqual([["db"], ["api", "worker"], ["web"]]);
    expect(() =>
      dependencyWaves([
        { name: "a", dependsOn: ["b"] },
        { name: "b", dependsOn: ["a"] },
      ]),
    ).toThrow(/circular dependsOn between a, b/);
  });

  it("builds start plans with PORT, the health URL and the expanded env", () => {
    const plan = planNativeRun(
      [
        makeResource("api", "bring-your-own", {
          command: "node s.js",
          port: 4100,
          healthCheckPath: "/health",
          restart: "no",
        }),
        makeResource("web", "bring-your-own", {
          command: "node w.js",
          port: 3100,
          dependsOn: ["api"],
          env: { API_URL: `http://localhost:${ref("API_PORT", "4100")}`, TOKEN: ref("SECRET") },
        }),
      ],
      { SECRET: "s3" },
    );
    expect(plan.errors).toEqual([]);
    expect(plan.missingVars).toEqual([]);
    expect(plan.services).toEqual([
      {
        name: "api",
        command: "node s.js",
        cwd: "/tmp/api",
        port: 4100,
        env: {
          PORT: "4100",
          FLISK_CHECKOUT_ID: expect.stringMatching(/^[0-9a-f]{8}$/),
          FLISK_CHECKOUT_NAME: expect.stringMatching(/^[a-z0-9-]+$/),
        },
        dependsOn: [],
        healthUrl: localUrl(4100, "/health"),
        rawHealthPath: "/health",
        url: localUrl(4100),
        restart: false,
      },
      expect.objectContaining({
        name: "web",
        env: {
          API_URL: localUrl(4100),
          TOKEN: "s3",
          PORT: "3100",
          FLISK_CHECKOUT_ID: expect.stringMatching(/^[0-9a-f]{8}$/),
          FLISK_CHECKOUT_NAME: expect.stringMatching(/^[a-z0-9-]+$/),
        },
        dependsOn: ["api"],
        healthUrl: undefined,
        restart: true,
      }),
    ]);
  });

  it("injects FLISK_CHECKOUT_ID and FLISK_CHECKOUT_NAME and expands them in env, healthCheck and probe", () => {
    const root = createTempDir("flisk-WT_Alpha-");
    const plan = planNativeRun(
      [
        nativeService(root, "api", {
          command: `node server.js --checkout ${ref("FLISK_CHECKOUT_ID")} --name ${ref("FLISK_CHECKOUT_NAME")}`,
          port: 4101,
          env: {
            COOKIE_NAME: `sid_${ref("FLISK_CHECKOUT_ID")}`,
            BUCKET: `${ref("FLISK_CHECKOUT_NAME")}-assets`,
          },
          healthCheck: {
            path: `/health/${ref("FLISK_CHECKOUT_ID")}`,
          },
        }),
        nativeService(root, "worker", {
          command: `node worker.js --id ${ref("FLISK_CHECKOUT_ID")}`,
          healthCheck: {
            command: ["probe", "--checkout", ref("FLISK_CHECKOUT_ID"), ref("FLISK_CHECKOUT_NAME")],
          },
        }),
      ],
      {},
      root,
    );

    expect(plan.errors).toEqual([]);
    expect(plan.missingVars).toEqual([]);

    const api = plan.services.find((s) => s.name === "api");
    const worker = plan.services.find((s) => s.name === "worker");
    expect(api).toBeDefined();
    expect(worker).toBeDefined();

    const checkoutId = api?.env.FLISK_CHECKOUT_ID ?? "";
    const checkoutName = api?.env.FLISK_CHECKOUT_NAME ?? "";
    expect(checkoutId).toMatch(/^[0-9a-f]{8}$/);
    expect(checkoutName).toMatch(/^flisk-wt-alpha-/);

    expect(api?.env.COOKIE_NAME).toBe(`sid_${checkoutId}`);
    expect(api?.env.BUCKET).toBe(`${checkoutName}-assets`);
    // A local command line stays as written: the platform shell expands `${VAR}` at launch from the child
    // environment (FLISK_CHECKOUT_ID and FLISK_CHECKOUT_NAME reach it through env), so a value is never spliced
    // into the line and reparsed as shell syntax.
    expect(api?.command).toBe(
      `node server.js --checkout ${ref("FLISK_CHECKOUT_ID")} --name ${ref("FLISK_CHECKOUT_NAME")}`,
    );
    expect(api?.healthUrl).toBe(localUrl(4101, `/health/${checkoutId}`));
    expect(api?.rawHealthPath).toBe(`/health/${ref("FLISK_CHECKOUT_ID")}`);

    expect(worker?.env.FLISK_CHECKOUT_ID).toBe(checkoutId);
    expect(worker?.env.FLISK_CHECKOUT_NAME).toBe(checkoutName);
    expect(worker?.command).toBe(`node worker.js --id ${ref("FLISK_CHECKOUT_ID")}`);
    expect(worker?.readiness).toEqual({
      kind: "command",
      command: ["probe", "--checkout", checkoutId, checkoutName],
    });
    expect(worker?.rawProbe).toEqual({
      kind: "command",
      command: ["probe", "--checkout", ref("FLISK_CHECKOUT_ID"), ref("FLISK_CHECKOUT_NAME")],
    });
  });

  it("passes FLISK_CHECKOUT_ID and FLISK_CHECKOUT_NAME to mixed docker run containers and expands container.command", () => {
    const root = createTempDir("flisk-mixed-");
    const plan = planNativeRun(
      [
        makeResource("cache", "bring-your-own", {
          image: "redis:7-alpine",
          port: 6379,
          env: { KEY_PREFIX: `${ref("FLISK_CHECKOUT_NAME")}:${ref("FLISK_CHECKOUT_ID")}` },
          container: {
            command: ["redis-server", "--save", "", "--syslog-ident", ref("FLISK_CHECKOUT_ID")],
          },
          healthCheck: { command: ["redis-cli", "ping", ref("FLISK_CHECKOUT_ID")] },
        }),
        nativeService(root, "api", { command: "node s.js", dependsOn: ["cache"] }),
      ],
      {},
      root,
      "shop",
    );

    expect(plan.errors).toEqual([]);
    const cache = plan.services.find((s) => s.name === "cache");
    const id = cache?.env.FLISK_CHECKOUT_ID ?? "";
    const name = cache?.env.FLISK_CHECKOUT_NAME ?? "";
    expect(id).toMatch(/^[0-9a-f]{8}$/);
    expect(name).toMatch(/^flisk-mixed-/);
    expect(cache?.env.KEY_PREFIX).toBe(`${name}:${id}`);
    expect(cache?.command).toContain("-e FLISK_CHECKOUT_ID -e FLISK_CHECKOUT_NAME");
    expect(cache?.command).toContain(`--syslog-ident ${id}`);
    expect(cache?.readiness).toEqual({
      kind: "command",
      command: ["docker", "exec", "flisk-shop-cache", "redis-cli", "ping", id],
    });
  });

  it("reports unresolved container command and entrypoint names in missingVars, but not defaulted ones", () => {
    const root = createTempDir("flisk-mixed-missing-");
    const plan = planNativeRun(
      [
        makeResource("cache", "bring-your-own", {
          image: "redis:7-alpine",
          port: 6379,
          container: {
            entrypoint: ["docker-entrypoint.sh", ref("GATEWAY_TOKEN")],
            command: ["redis-server", "--syslog-ident", ref("MISSING_IDENT")],
          },
        }),
        nativeService(root, "api", {
          command: "node s.js",
          env: { REPLICA_OF: ref("CACHE_MODE", "replica") },
        }),
      ],
      {},
      root,
      "shop",
    );

    // The defaulted reference and the local command stay unreported; the container words report like env values.
    expect(plan.missingVars).toEqual(["cache: GATEWAY_TOKEN", "cache: MISSING_IDENT"]);
  });

  it("delivers FLISK_CHECKOUT_ID and FLISK_CHECKOUT_NAME into a spawned local process environment", async () => {
    const root = createTempDir("flisk-live-checkout-");
    writeFileSync(
      join(root, "dump-env.mjs"),
      `import { writeFileSync } from "node:fs";
writeFileSync("checkout.json", JSON.stringify({
  id: process.env.FLISK_CHECKOUT_ID,
  name: process.env.FLISK_CHECKOUT_NAME,
  arg: process.argv[2],
}));`,
    );
    const plan = planNativeRun(
      [
        nativeService(root, "job", {
          command: `${NODE} dump-env.mjs ${ref("FLISK_CHECKOUT_ID")}`,
          restart: "no",
        }),
      ],
      {},
      root,
    );
    const supervisor = new NativeSupervisor(root, plan.services);
    supervisors.push(supervisor);
    const failures = await supervisor.start();
    expect(failures).toEqual([]);
    await waitFor(() => existsSync(join(root, "checkout.json")));
    const written = JSON.parse(readFileSync(join(root, "checkout.json"), "utf-8")) as {
      id: string;
      name: string;
      arg: string;
    };
    expect(written.id).toBe(plan.services[0]?.env.FLISK_CHECKOUT_ID);
    expect(written.name).toBe(plan.services[0]?.env.FLISK_CHECKOUT_NAME);
    expect(written.arg).toBe(written.id);
  });

  it("delivers a shell-metacharacter value as one literal argument, never reparsed as shell syntax", async () => {
    const root = createTempDir("flisk-raw-cmd-");
    // A value with quotes, a substitution and backticks: splicing it into the shell line would rebalance quotes
    // and execute code. The platform shell expands the reference inside double quotes, so it stays one argument.
    const spicy = 'ab"c$(echo pwned)`id`';
    writeFileSync(
      join(root, "dump-arg.mjs"),
      `import { writeFileSync } from "node:fs";
writeFileSync("arg.json", process.argv[2] ?? "");`,
    );
    const plan = planNativeRun(
      [
        nativeService(root, "job", {
          command: `${NODE} dump-arg.mjs "${ref("SPICY_TOKEN")}"`,
          env: { SPICY_TOKEN: spicy },
          restart: "no",
        }),
      ],
      {},
      root,
    );
    const supervisor = new NativeSupervisor(root, plan.services);
    supervisors.push(supervisor);
    const failures = await supervisor.start();
    expect(failures).toEqual([]);
    await waitFor(() => existsSync(join(root, "arg.json")));
    expect(readFileSync(join(root, "arg.json"), "utf-8")).toBe(spicy);
  });

  it("refuses a dependsOn on infrastructure the native runtime cannot start, and a shared port", () => {
    const plan = planNativeRun([
      makeResource("api", "bring-your-own", { command: "x", port: 4100, dependsOn: ["postgres"] }),
      makeResource("web", "bring-your-own", { command: "y", port: 4100 }),
    ]);
    expect(plan.errors).toEqual([
      expect.stringMatching(
        /^service "api" dependsOn "postgres", which is not a service in this project/,
      ),
      'services "api" and "web" both use port 4100',
    ]);
  });

  it("plans an image service as a docker run line, its probe inside the container, no PORT", () => {
    const plan = planNativeRun(
      [
        makeResource("postgres", "bring-your-own", {
          image: "postgres:15-alpine",
          port: 5432,
          env: { POSTGRES_PASSWORD: ref("PG_PASSWORD") },
          healthCheck: { command: ["pg_isready"] },
        }),
        makeResource("api", "bring-your-own", { command: "node s.js", dependsOn: ["postgres"] }),
      ],
      { PG_PASSWORD: "pw" },
      "/tmp",
      "shop",
    );
    expect(plan.errors).toEqual([]);
    const db = plan.services.find((service) => service.name === "postgres");
    expect(db).toMatchObject({
      container: "flisk-shop-postgres",
      env: { POSTGRES_PASSWORD: "pw" },
      readiness: {
        kind: "command",
        command: ["docker", "exec", "flisk-shop-postgres", "pg_isready"],
      },
      url: "localhost:5432",
    });
    expect(db?.command).toContain("-p 127.0.0.1:5432:5432 -e POSTGRES_PASSWORD");
    // The value reaches docker through its environment, never its arguments.
    expect(db?.command).not.toContain("pw");
    expect(plan.services.find((service) => service.name === "api")?.dependsOn).toEqual([
      "postgres",
    ]);
  });

  it("reads the deprecated dependencies key and expands a stack name, as the Docker path does", () => {
    const stacked = (name: string, stack: string, config: Record<string, unknown>) => ({
      ...makeResource(name, "bring-your-own", { command: "x", ...config }),
      stack,
    });
    const plan = planNativeRun([
      stacked("db", "core", {}),
      stacked("cache", "core", {}),
      stacked("api", "edge", { dependsOn: ["core"] }),
      stacked("web", "edge", { dependencies: ["db"] }),
    ]);
    expect(plan.errors).toEqual([]);
    expect(plan.services.find((s) => s.name === "api")?.dependsOn).toEqual(["db", "cache"]);
    expect(plan.services.find((s) => s.name === "web")?.dependsOn).toEqual(["db"]);
  });

  it("names services whose program is not installed", () => {
    const plans = planNativeRun([
      makeResource("api", "bring-your-own", { command: "node s.js" }),
      makeResource("go", "bring-your-own", { command: "PORT=1 nope-runtime run" }),
      makeResource("bin", "bring-your-own", { command: "./bin/server" }),
    ]).services;
    expect(
      findMissingPrograms(
        plans,
        (program) => (program === "node" ? "/usr/bin/node" : null),
        () => false,
      ),
    ).toEqual([
      { name: "go", program: "nope-runtime" },
      { name: "bin", program: "./bin/server" },
    ]);
  });
});

describe("service directory .env expansion (#3141)", () => {
  const envOf = (dir: string, vars: Record<string, string>) => {
    const plan = planNativeRun(
      [
        nativeService(dir, "web", {
          command: "node s.js",
          env: {
            A: ref("A", "from-default"),
            B: ref("B", "from-default"),
            C: ref("C", "from-default"),
            D: ref("D", "from-default"),
          },
        }),
      ],
      vars,
      dir,
    );
    return { env: plan.services[0]?.env, missing: plan.missingVars };
  };

  it("resolves shell > project .env > service .env > default", () => {
    const dir = createTempDir();
    writeFileSync(join(dir, ".env"), "A=svc-a\nB=svc-b\nC=svc-c\n");
    // `vars` is the shell merged over the project .env, as runNativeUp builds it.
    const { env, missing } = envOf(dir, { A: "shell-a", B: "project-b" });
    expect(env).toMatchObject({
      A: "shell-a",
      B: "project-b",
      C: "svc-c",
      D: "from-default",
    });
    expect(missing).toEqual([]);
  });

  it("ignores a missing service .env", () => {
    const { env, missing } = envOf(createTempDir(), { A: "shell-a" });
    expect(env).toMatchObject({ A: "shell-a", B: "from-default" });
    expect(missing).toEqual([]);
  });

  it("hands the child the value from the service .env", async () => {
    const root = createTempDir();
    writeFileSync(join(root, ".env"), "GREETING=from-service-dotenv\n");
    writeFileSync(
      join(root, "p.mjs"),
      `import { writeFileSync } from "node:fs";
writeFileSync("out.txt", process.env.GREETING + "|" + process.env.OTHER);`,
    );
    const plan = planNativeRun(
      [
        nativeService(root, "job", {
          command: `${NODE} p.mjs`,
          restart: "no",
          env: { GREETING: ref("GREETING", "default"), OTHER: ref("OTHER", "dflt") },
        }),
      ],
      { OTHER: "from-shell" },
      root,
    );
    const supervisor = new NativeSupervisor(root, plan.services);
    supervisors.push(supervisor);
    await supervisor.start();
    await waitFor(() => existsSync(join(root, "out.txt")));
    expect(readFileSync(join(root, "out.txt"), "utf-8")).toBe("from-service-dotenv|from-shell");
  });
});

describe("native supervisor", () => {
  it("redacts default and selected env secrets before terminal output and private log writes", async () => {
    const root = createTempDir();
    const jwt = "NATIVE_JWT_SECRET_DO_NOT_LOG_12345";
    const password = "NATIVE_DB_PASSWORD_DO_NOT_LOG_67890";
    const extraEnvPath = join(root, ".env.integration");
    writeFileSync(join(root, ".env"), `JWT_SECRET=${jwt}\n`);
    writeFileSync(extraEnvPath, `DB_PASSWORD=${password}\n`);
    writeFileSync(
      join(root, "leaker.mjs"),
      "console.log(`jwt=${process.env.JWT_SECRET} db=${process.env.DB_PASSWORD}`);\n",
    );
    const logPath = nativeLogPath(root, "leaker");
    mkdirSync(join(root, ".flisk", "native", "logs"), { recursive: true, mode: 0o755 });
    writeFileSync(logPath, "previous benign log\n", { mode: 0o644 });

    const vars = { JWT_SECRET: jwt, DB_PASSWORD: password };
    const plan = planNativeRun(
      [nativeService(root, "leaker", { appType: "migrator", command: `${NODE} leaker.mjs` })],
      vars,
      root,
    );
    const lines: string[] = [];
    const supervisor = new NativeSupervisor(
      root,
      plan.services,
      { onLine: (_name, line) => lines.push(line) },
      { baseEnv: vars, extraEnvPaths: [extraEnvPath] },
    );
    supervisors.push(supervisor);
    expect(await supervisor.start()).toEqual([]);
    await waitFor(() => lines.length > 0);

    const stored = readFileSync(logPath, "utf-8");
    expect(lines).toContain("jwt=[REDACTED] db=[REDACTED]");
    expect(stored).toContain("jwt=[REDACTED] db=[REDACTED]");
    expect(stored).not.toContain(jwt);
    expect(stored).not.toContain(password);
    if (process.platform !== "win32") {
      expect(statSync(logPath).mode & 0o777).toBe(0o600);
      expect(statSync(join(root, ".flisk", "native", "logs")).mode & 0o777).toBe(0o700);
    }
  });

  it("masks secret shapes and a printed private key before output and the stored log", async () => {
    const root = createTempDir();
    writeFileSync(
      join(root, "leaker.mjs"),
      [
        'console.log("Authorization: Bearer abcdef1234567890");',
        'console.log("-----' + 'BEGIN PRIVATE KEY-----");',
        'console.log("MIIEvQIBADANBgkqhkiG9w0BAQEFAASC");',
        'console.log("-----' + 'END PRIVATE KEY-----");',
        'console.log("done");',
      ].join("\n"),
    );
    const plan = planNativeRun(
      [nativeService(root, "leaker", { appType: "migrator", command: `${NODE} leaker.mjs` })],
      {},
      root,
    );
    const lines: string[] = [];
    const supervisor = new NativeSupervisor(root, plan.services, {
      onLine: (_name, line) => lines.push(line),
    });
    supervisors.push(supervisor);
    expect(await supervisor.start()).toEqual([]);
    await waitFor(() => lines.includes("done"));

    const stored = readFileSync(nativeLogPath(root, "leaker"), "utf-8");
    for (const text of [lines.join("\n"), stored]) {
      expect(text).toContain("Bearer [REDACTED]");
      expect(text).not.toContain("abcdef1234567890");
      expect(text).not.toContain("MIIEvQIBADANBgkqhkiG9w0BAQEFAASC");
    }
  });

  it("starts a service only after its dependency answers, and serves both", async () => {
    const root = createTempDir();
    const apiDir = join(root, "api");
    const webDir = join(root, "web");
    for (const dir of [apiDir, webDir]) {
      mkdirSync(dir);
      writeFileSync(join(dir, "server.mjs"), SERVER);
    }
    const [apiPort, webPort] = [await freePort(), await freePort()];
    const plan = planNativeRun([
      nativeService(apiDir, "api", {
        command: `${NODE} server.mjs`,
        port: apiPort,
        healthCheckPath: "/health",
        env: { GREETING: "from api" },
      }),
      nativeService(webDir, "web", {
        command: `${NODE} server.mjs`,
        port: webPort,
        dependsOn: ["api"],
      }),
    ]);
    const notes: string[] = [];
    const supervisor = new NativeSupervisor(root, plan.services, {
      onNote: (name, message) => notes.push(`${name}: ${message.split(":")[0]}`),
    });
    supervisors.push(supervisor);

    expect(await supervisor.start()).toEqual([]);
    expect(notes.indexOf("web: started")).toBeGreaterThan(notes.indexOf("api: ready"));
    expect(await (await fetch(localUrl(apiPort))).text()).toBe("from api");
    expect((await fetch(localUrl(webPort, "/health"))).status).toBe(200);

    const state = readNativeRunState(root);
    expect(state?.pid).toBe(process.pid);
    expect(Object.keys(state?.services ?? {})).toEqual(["api", "web"]);
    expect(readFileSync(join(root, ".flisk", "native", ".gitignore"), "utf-8")).toBe("*\n");

    await waitFor(() => existsSync(nativeLogPath(root, "web")));
    const lines = readNativeLogLines(root, ["api", "web"], { tail: 10 });
    expect(lines.map((line) => `${line.resource}: ${line.text}`)).toEqual([
      `api: listening on ${apiPort}`,
      `web: listening on ${webPort}`,
    ]);
    expect(lines[0]?.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(
      readNativeLogLines(root, ["api"], { tail: 10, sinceMs: 0, now: Date.now() + 60_000 }),
    ).toEqual([]);

    await supervisor.stop();
    expect(existsSync(nativeRunStatePath(root))).toBe(false);
    expect(isProcessAlive(state?.services.api?.pid as number)).toBe(false);
  });

  it("restarts a service that crashes", async () => {
    const root = createTempDir();
    writeFileSync(join(root, "server.mjs"), SERVER);
    const port = await freePort();
    const plan = planNativeRun([
      nativeService(root, "api", {
        command: `${NODE} server.mjs`,
        port,
        healthCheckPath: "/health",
      }),
    ]);
    const notes: string[] = [];
    const supervisor = new NativeSupervisor(
      root,
      plan.services,
      { onNote: (_name, message) => notes.push(message) },
      { restartDelayMs: 50 },
    );
    supervisors.push(supervisor);
    expect(await supervisor.start()).toEqual([]);
    const firstPid = supervisor.pidOf("api") as number;

    process.kill(-firstPid, "SIGKILL");
    await waitFor(() => notes.includes("ready again"));
    expect(notes).toContain("was stopped by SIGKILL; restarting in 0.05s");
    expect(supervisor.pidOf("api")).not.toBe(firstPid);
    expect((await fetch(localUrl(port, "/health"))).status).toBe(200);
  });

  it("redacts a secret that appears in the started note, and still starts the service", async () => {
    const root = createTempDir();
    writeFileSync(join(root, ".env"), "HARDCODED_TOKEN=sk-live-redact-me-9f2c\n");
    const plan = planNativeRun([
      nativeService(root, "job", {
        command: "true --token sk-live-redact-me-9f2c",
        restart: "no",
      }),
    ]);
    const notes: string[] = [];
    const supervisor = new NativeSupervisor(root, plan.services, {
      onNote: (_name, message) => notes.push(message),
    });
    supervisors.push(supervisor);

    expect(await supervisor.start()).toEqual([]);
    // The service started (the job ran to exit 0) and its note names the command without the env-file secret.
    expect(notes).toContain("finished (exit code 0)");
    const started = notes.find((note) => note.startsWith("started:"));
    expect(started).toBeDefined();
    expect(started).not.toContain("sk-live-redact-me-9f2c");
    expect(started).toContain("true --token");
  });

  it("withholds the started note when the env file cannot be read for redaction, and still starts the service", async () => {
    const root = createTempDir();
    // A directory named .env makes the redactor's env read fail, like an unreadable file would.
    mkdirSync(join(root, ".env"));
    const plan = planNativeRun([
      nativeService(root, "job", { command: "true --token sk-nomask-1", restart: "no" }),
    ]);
    const notes: string[] = [];
    const supervisor = new NativeSupervisor(root, plan.services, {
      onNote: (_name, message) => notes.push(message),
    });
    supervisors.push(supervisor);

    expect(await supervisor.start()).toEqual([]);
    expect(notes).toContain("finished (exit code 0)");
    const started = notes.find((note) => note.startsWith("started:"));
    expect(started).toBe("started: [output withheld: the project's env files could not be read]");
  });

  it("waits for a dependency that went down instead of giving up, then starts the dependent again", async () => {
    const root = createTempDir();
    const [dbDir, apiDir] = [join(root, "db"), join(root, "api")];
    mkdirSync(dbDir);
    mkdirSync(apiDir);
    writeFileSync(join(dbDir, "db.mjs"), DB_SCRIPT);
    writeFileSync(join(apiDir, "api.mjs"), API_SCRIPT);
    const [dbPort, apiPort] = [await freePort(), await freePort()];
    const plan = planNativeRun([
      nativeService(dbDir, "db", {
        command: `${NODE} db.mjs`,
        port: dbPort,
        healthCheckPath: "/health",
      }),
      nativeService(apiDir, "api", {
        command: `${NODE} api.mjs`,
        port: apiPort,
        healthCheckPath: "/health",
        dependsOn: ["db"],
        env: { DB_PORT: String(dbPort) },
      }),
    ]);
    const notes: string[] = [];
    const supervisor = new NativeSupervisor(
      root,
      plan.services,
      { onNote: (name, message) => notes.push(`${name}: ${message}`) },
      { restartDelayMs: 10 },
    );
    supervisors.push(supervisor);
    expect(await supervisor.start()).toEqual([]);

    writeFileSync(join(dbDir, "down"), "");
    process.kill(-(supervisor.pidOf("db") as number), "SIGKILL");
    await waitFor(() =>
      notes.some((note) => note.startsWith("api: exited with code 1 while db is down")),
    );
    expect(nativeServiceStates(root, ["api"]).api).toEqual({
      status: "pending",
      reason: "waiting for db",
    });
    // Five 10ms restarts would have run out long before this: the API is waiting, not crashing.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect(notes.filter((note) => /^api: .*not restarted/.test(note))).toEqual([]);

    rmSync(join(dbDir, "down"));
    await waitFor(() => notes.includes("api: ready again"));
    expect(notes).toContain("api: db is ready again; starting");
    expect((await fetch(localUrl(apiPort, "/health"))).status).toBe(200);
  });

  it("does not wait for a dependency that gave up: the dependent counts its crashes and stops", async () => {
    const root = createTempDir();
    const [dbDir, apiDir] = [join(root, "db"), join(root, "api")];
    mkdirSync(dbDir);
    mkdirSync(apiDir);
    writeFileSync(join(dbDir, "db.mjs"), DB_SCRIPT);
    writeFileSync(join(apiDir, "api.mjs"), API_SCRIPT);
    const [dbPort, apiPort] = [await freePort(), await freePort()];
    const plan = planNativeRun([
      // "restart": "no" with a port: once it exits it is never started again.
      nativeService(dbDir, "db", { command: `${NODE} db.mjs`, port: dbPort, restart: "no" }),
      nativeService(apiDir, "api", {
        command: `${NODE} api.mjs`,
        port: apiPort,
        healthCheckPath: "/health",
        dependsOn: ["db"],
        env: { DB_PORT: String(dbPort) },
      }),
    ]);
    const notes: string[] = [];
    const supervisor = new NativeSupervisor(
      root,
      plan.services,
      { onNote: (name, message) => notes.push(`${name}: ${message}`) },
      { restartDelayMs: 10 },
    );
    supervisors.push(supervisor);
    expect(await supervisor.start()).toEqual([]);

    process.kill(-(supervisor.pidOf("db") as number), "SIGKILL");
    await waitFor(() => notes.some((note) => /^api: .*exited 5 times in a row/.test(note)));
    expect(notes.filter((note) => note.includes("while db is down"))).toEqual([]);
  });

  it('starts the services that depend on a no-port "restart": "no" service that exits 0, whatever its appType', async () => {
    const root = createTempDir();
    const worker = makeResource("migrate", "worker", { command: "exit 0", restart: "no" });
    const plan = planNativeRun([
      { ...worker, path: root, configPath: join(root, "service.json") },
      nativeService(root, "web", { command: "sleep 30", dependsOn: ["migrate"] }),
    ]);
    const notes: string[] = [];
    const supervisor = new NativeSupervisor(
      root,
      plan.services,
      { onNote: (_name, message) => notes.push(message) },
      { restartDelayMs: 10 },
    );
    supervisors.push(supervisor);
    expect(await supervisor.start()).toEqual([]);
    // The exit was seen before start() returned, so this ran the case it names (an exit inside the readiness grace).
    expect(notes).toContain('exited with code 0; not restarting ("restart": "no")');
  });

  it("stops restarting a service that keeps exiting, and reports it", async () => {
    const root = createTempDir();
    // A port that never opens makes start() poll until the supervisor gives up, instead of calling a process that is still alive
    // after the 1s grace "ready": five fast restarts can take longer than that grace on a loaded machine (#2898).
    const plan = planNativeRun([
      nativeService(root, "job", { command: "exit 3", port: await freePort() }),
    ]);
    const notes: string[] = [];
    const supervisor = new NativeSupervisor(
      root,
      plan.services,
      { onNote: (_name, message) => notes.push(message) },
      { restartDelayMs: 10 },
    );
    supervisors.push(supervisor);
    expect(await supervisor.start()).toEqual([
      { name: "job", reason: "kept exiting; see its output above" },
    ]);
    expect(notes.filter((note) => note.startsWith("exited with code 3; restarting"))).toHaveLength(
      4,
    );
    expect(notes.at(-1)).toMatch(/exited 5 times in a row, so it is not restarted/);
  });

  it('does not restart a service with "restart": "no"', async () => {
    const root = createTempDir();
    const plan = planNativeRun([nativeService(root, "once", { command: "exit 0", restart: "no" })]);
    const notes: string[] = [];
    const supervisor = new NativeSupervisor(root, plan.services, {
      onNote: (_name, message) => notes.push(message),
    });
    supervisors.push(supervisor);
    await supervisor.start();
    // A bring-your-own resource with "restart": "no" and no port is a one-shot job: done once it exits 0.
    expect(notes).toContain("finished (exit code 0)");
  });

  it("starts a dependent only after its one-shot job exited 0 (#2871)", async () => {
    const root = createTempDir();
    writeFileSync(join(root, "server.mjs"), SERVER);
    const port = await freePort();
    const plan = planNativeRun([
      // Takes long enough that a dependent started on "process alive" would come first.
      nativeService(root, "migrate", { appType: "migrator", command: "sleep 2" }),
      nativeService(root, "api", {
        command: `${NODE} server.mjs`,
        port,
        healthCheckPath: "/health",
        dependsOn: ["migrate"],
      }),
    ]);
    expect(plan.services.find((service) => service.name === "migrate")).toMatchObject({
      job: true,
      restart: false,
    });
    const notes: string[] = [];
    const supervisor = new NativeSupervisor(root, plan.services, {
      onNote: (name, message) => notes.push(`${name}: ${message}`),
    });
    supervisors.push(supervisor);

    expect(await supervisor.start()).toEqual([]);
    expect(notes.findIndex((note) => note.startsWith("api: started"))).toBeGreaterThan(
      notes.indexOf("migrate: finished (exit code 0)"),
    );
    expect((await fetch(localUrl(port, "/health"))).status).toBe(200);
  });

  it("does not start a dependent when its job fails, and does not restart the job", async () => {
    const root = createTempDir();
    const port = await freePort();
    const plan = planNativeRun([
      nativeService(root, "migrate", { appType: "migrator", command: "exit 3" }),
      nativeService(root, "api", { command: "sleep 30", port, dependsOn: ["migrate"] }),
    ]);
    const notes: string[] = [];
    const supervisor = new NativeSupervisor(root, plan.services, {
      onNote: (name, message) => notes.push(`${name}: ${message}`),
    });
    supervisors.push(supervisor);
    expect(await supervisor.start()).toEqual([
      { name: "migrate", reason: "the job did not exit 0; see its output above" },
      { name: "api", reason: "not started: migrate did not start" },
    ]);
    expect(supervisor.pidOf("api")).toBeUndefined();
    expect(notes).toContain("migrate: exited with code 3; a job is not restarted");
  });

  it("stops what the shell started too, not only the shell", async () => {
    const root = createTempDir();
    writeFileSync(join(root, "server.mjs"), SERVER);
    const port = await freePort();
    // The shell forks: `sleep` runs beside the server in the service's process group.
    const plan = planNativeRun([
      nativeService(root, "api", {
        command: `sleep 300 & echo "sleep $!" && ${NODE} server.mjs`,
        port,
      }),
    ]);
    const lines: string[] = [];
    const supervisor = new NativeSupervisor(root, plan.services, {
      onLine: (_name, line) => lines.push(line),
    });
    supervisors.push(supervisor);
    expect(await supervisor.start()).toEqual([]);
    await waitFor(() => lines.some((line) => line.startsWith("sleep ")));
    const sleepPid = Number(lines.find((line) => line.startsWith("sleep "))?.slice(6));
    expect(isProcessAlive(sleepPid)).toBe(true);
    await supervisor.stop();
    await waitFor(() => !isProcessAlive(sleepPid));
  });

  it("gives independent services that ignore SIGTERM their grace period together, not one after another (#3811)", async () => {
    const root = createTempDir();
    const stubborn = `trap "" TERM INT; while true; do sleep 0.1; done`;
    const plan = planNativeRun(
      ["a", "b", "c"].map((name) => nativeService(root, name, { command: stubborn })),
    );
    const supervisor = new NativeSupervisor(root, plan.services, {}, { stopTimeoutMs: 1_000 });
    supervisors.push(supervisor);
    expect(await supervisor.start()).toEqual([]);
    const pids = ["a", "b", "c"].map((name) => supervisor.pidOf(name) as number);

    const started = Date.now();
    await supervisor.stop();
    // One after another this takes 3 x 1 s.
    expect(Date.now() - started).toBeLessThan(2_500);
    await waitFor(() => pids.every((pid) => !isProcessAlive(pid)));
  });

  it("still stops dependents before what they depend on", async () => {
    const root = createTempDir();
    const log = join(root, "stops.log");
    const service = (name: string, dependsOn: string[]) =>
      nativeService(root, name, {
        command: `trap 'echo ${name} >> ${JSON.stringify(log)}; exit 0' TERM; while true; do sleep 0.1; done`,
        dependsOn,
      });
    const plan = planNativeRun([service("a", []), service("b", ["a"]), service("c", ["b"])]);
    const supervisor = new NativeSupervisor(root, plan.services);
    supervisors.push(supervisor);
    expect(await supervisor.start()).toEqual([]);

    await supervisor.stop();
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(["c", "b", "a"]);
  });
});

describe("stopping a native run from another process", () => {
  it("stops service processes a killed supervisor left behind", async () => {
    const root = createTempDir();
    const orphan = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    await new Promise<void>((resolve, reject) => {
      orphan.once("spawn", resolve);
      orphan.once("error", reject);
    });
    orphan.unref();
    const deadSupervisor = spawn(process.execPath, ["-e", ""]);
    await new Promise((resolve) => deadSupervisor.once("exit", resolve));
    mkdirSync(join(root, ".flisk", "native"), { recursive: true });
    writeFileSync(
      nativeRunStatePath(root),
      JSON.stringify({
        pid: deadSupervisor.pid,
        startedAt: new Date().toISOString(),
        services: {
          api: { pid: orphan.pid, startTime: await processStartTime(orphan.pid as number) },
        },
      }),
    );

    expect(await stopNativeRun(root)).toEqual({
      wasRunning: true,
      services: ["api"],
      supervisorPid: deadSupervisor.pid,
    });
    await waitFor(() => !isProcessAlive(orphan.pid as number));
    expect(existsSync(nativeRunStatePath(root))).toBe(false);
    expect(await stopNativeRun(root)).toEqual({ wasRunning: false, services: [] });
  });
});

describe("run.json records who flisk started (#3960)", () => {
  it("waits for service identities before reporting startup complete", async () => {
    const root = createTempDir();
    writeFileSync(join(root, "loop.mjs"), "setInterval(() => {}, 1000);\n");
    const plan = planNativeRun([nativeService(root, "api", { command: `${NODE} loop.mjs` })]);
    let releaseIdentity!: (value: string) => void;
    const serviceIdentity = new Promise<string>((resolve) => {
      releaseIdentity = resolve;
    });
    const supervisor = new NativeSupervisor(
      root,
      plan.services,
      {},
      {
        startTimeOf: (pid) =>
          pid === process.pid ? Promise.resolve("supervisor") : serviceIdentity,
      },
    );
    supervisors.push(supervisor);
    let completed = false;
    const starting = supervisor.start().then(() => {
      completed = true;
    });
    try {
      await waitFor(() => supervisor.pidOf("api") !== undefined);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(completed).toBe(false);
    } finally {
      releaseIdentity("service");
      await starting;
    }
    expect(readNativeRunState(root)?.services.api?.startTime).toBe("service");
  });

  it("saves the start time of the supervisor and of each service process", async () => {
    const root = createTempDir();
    const plan = planNativeRun([
      nativeService(root, "api", { command: `${NODE} -e "setInterval(() => {}, 1000)"` }),
    ]);
    const supervisor = new NativeSupervisor(root, plan.services);
    supervisors.push(supervisor);
    await supervisor.start();
    const pid = supervisor.pidOf("api") as number;
    const expected = await processStartTime(pid);
    expect(expected).toBeTruthy();

    await waitFor(() => readNativeRunState(root)?.services.api?.startTime === expected);
    await waitFor(() => Boolean(readNativeRunState(root)?.pidStartTime));
    expect(readNativeRunState(root)?.pidStartTime).toBe(await processStartTime(process.pid));
  }, 60_000);
});

describe("stopNativeRun only signals processes it can prove it started (#3960)", () => {
  const NOW = Date.parse("2026-11-17T10:00:00Z");

  /** A fake process table: pid -> start time. A pid missing from it is not running. */
  function harness(table: Record<number, string | undefined>, bootTime = NOW - 3_600_000) {
    const signalled: number[] = [];
    const terminated: number[] = [];
    const deps = {
      isAlive: (pid: number) => pid in table,
      startTimeOf: async (pid: number) => table[pid],
      bootTimeMs: () => bootTime,
      stopGroup: async (pid: number) => {
        signalled.push(pid);
      },
      terminateSupervisor: async (pid: number) => {
        terminated.push(pid);
      },
    };
    return { deps, signalled, terminated };
  }

  function writeState(root: string, state: Record<string, unknown>): void {
    mkdirSync(join(root, ".flisk", "native"), { recursive: true });
    writeFileSync(nativeRunStatePath(root), JSON.stringify(state));
  }

  it("does not signal a recycled pid whose start time differs, and calls the record stale", async () => {
    const root = createTempDir();
    writeState(root, {
      pid: 100,
      pidStartTime: "sup-T1",
      startedAt: new Date(NOW - 60_000).toISOString(),
      services: { api: { pid: 200, startTime: "api-T1" } },
    });
    const { deps, signalled, terminated } = harness({ 100: "other-T9", 200: "other-T8" });

    const result = await stopNativeRun(root, { deps });

    expect(signalled).toEqual([]);
    expect(terminated).toEqual([]);
    expect(result).toMatchObject({ wasRunning: false, stale: true, services: [] });
    expect(existsSync(nativeRunStatePath(root))).toBe(false);
  });

  it("signals the supervisor and a service whose start times still match", async () => {
    const root = createTempDir();
    writeState(root, {
      pid: 100,
      pidStartTime: "sup-T1",
      startedAt: new Date(NOW - 60_000).toISOString(),
      services: { api: { pid: 200, startTime: "api-T1" }, web: { pid: 300, startTime: "web-T1" } },
    });
    const { deps, signalled, terminated } = harness({
      100: "sup-T1",
      200: "api-T1",
      300: "someone-else",
    });

    const result = await stopNativeRun(root, { deps });

    expect(terminated).toEqual([100]);
    expect(signalled).toEqual([200]);
    expect(result).toMatchObject({ wasRunning: true, services: ["api"], supervisorPid: 100 });
    expect(result.stale).toBeUndefined();
  });

  it("signals nothing for a run recorded before the last boot", async () => {
    const root = createTempDir();
    writeState(root, {
      pid: 100,
      pidStartTime: "sup-T1",
      startedAt: new Date(NOW - 7_200_000).toISOString(),
      services: { api: { pid: 200, startTime: "api-T1" } },
    });
    // Even matching start times are not trusted: a reboot resets them.
    const { deps, signalled, terminated } = harness({ 100: "sup-T1", 200: "api-T1" });

    const result = await stopNativeRun(root, { deps });

    expect(signalled).toEqual([]);
    expect(terminated).toEqual([]);
    expect(result).toMatchObject({ wasRunning: false, stale: true });
    expect(existsSync(nativeRunStatePath(root))).toBe(false);
  });

  it("does not signal a live pid from an older run.json with no start time, and reports it", async () => {
    const root = createTempDir();
    writeState(root, {
      pid: 100,
      startedAt: new Date(NOW - 60_000).toISOString(),
      services: { api: { pid: 200 }, done: { pid: 400 } },
    });
    const { deps, signalled, terminated } = harness({ 100: "sup-T1", 200: "api-T1" });

    const result = await stopNativeRun(root, { deps });

    expect(signalled).toEqual([]);
    expect(terminated).toEqual([]);
    expect(result.unverified).toEqual([
      { name: "api", pid: 200 },
      { name: "flisk up", pid: 100 },
    ]);
  });

  it("does not signal a live pid whose start time cannot be read (another user's process)", async () => {
    const root = createTempDir();
    writeState(root, {
      pid: 100,
      pidStartTime: "sup-T1",
      startedAt: new Date(NOW - 60_000).toISOString(),
      services: { api: { pid: 200, startTime: "api-T1" } },
    });
    const { deps, signalled } = harness({ 200: undefined });

    const result = await stopNativeRun(root, { deps });

    expect(signalled).toEqual([]);
    expect(result.unverified).toEqual([{ name: "api", pid: 200 }]);
    expect(result.services).toEqual([]);
  });
});

describe("nativeServiceStates", () => {
  it("reports a one-shot job that exited 0 as ready, and only a crashed long-running service as restarting", async () => {
    const root = createTempDir();
    const exited = spawn(process.execPath, ["-e", ""]);
    await new Promise((resolve) => exited.once("exit", resolve));
    const live = spawn("sleep", ["300"], { stdio: "ignore" });
    try {
      mkdirSync(join(root, ".flisk", "native"), { recursive: true });
      writeFileSync(
        nativeRunStatePath(root),
        JSON.stringify({
          // This test process stands in for the supervisor, so the run counts as up.
          pid: process.pid,
          startedAt: new Date().toISOString(),
          services: {
            setup: { pid: exited.pid, ready: true, job: true },
            broken: { pid: exited.pid, ready: false, job: true },
            api: { pid: exited.pid, port: 4000, ready: false },
            web: { pid: live.pid, port: 3000, ready: true },
          },
        }),
      );
      expect(nativeServiceStates(root, ["setup", "broken", "api", "web"])).toEqual({
        setup: { status: "ready", reason: "finished" },
        broken: { status: "pending", reason: "the job did not exit 0" },
        api: { status: "pending", reason: "restarting" },
        web: { status: "ready" },
      });
    } finally {
      live.kill();
    }
  });

  it("records a one-shot job in the run state, so status can tell it from a crash", async () => {
    const root = createTempDir();
    const plan = planNativeRun([
      nativeService(root, "setup", { command: "exit 0", restart: "no" }),
    ]);
    const supervisor = new NativeSupervisor(root, plan.services, {});
    supervisors.push(supervisor);
    await supervisor.start();
    expect(readNativeRunState(root)?.services.setup).toMatchObject({ ready: true, job: true });
    // The supervisor writes its own pid as the run's, and it is this test process: the run is up.
    expect(nativeServiceStates(root, ["setup"]).setup).toEqual({
      status: "ready",
      reason: "finished",
    });
  });
});

describe("terminateSupervisorProcess", () => {
  it("ends the supervisor's whole process tree on Windows, so its services go with it", async () => {
    const killed: number[] = [];
    const kill = vi.spyOn(process, "kill");
    // A pid that does not exist, so the wait that follows returns at once.
    await terminateSupervisorProcess(2_147_000_000, 50, "win32", (pid) => killed.push(pid));
    expect(killed).toEqual([2_147_000_000]);
    expect(kill).not.toHaveBeenCalledWith(2_147_000_000, "SIGTERM");
    kill.mockRestore();
  });

  it("sends SIGTERM on POSIX and never runs taskkill", async () => {
    const killed: number[] = [];
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    await terminateSupervisorProcess(2_147_000_000, 50, "linux", (pid) => killed.push(pid));
    expect(kill).toHaveBeenCalledWith(2_147_000_000, "SIGTERM");
    expect(killed).toEqual([]);
    kill.mockRestore();
  });
});

describe("detachesServices", () => {
  it("gives a service its own process group on POSIX and not on Windows", () => {
    expect(detachesServices("linux")).toBe(true);
    expect(detachesServices("darwin")).toBe(true);
    expect(detachesServices("win32")).toBe(false);
  });

  it("logs a crashing service's final error, redacts secrets, and includes the log in failures", async () => {
    const root = createTempDir();
    const token = "NATIVE_CRASH_TOKEN_DO_NOT_LOG_12345";
    writeFileSync(join(root, ".env"), `API_TOKEN=${token}\n`);
    writeFileSync(
      join(root, "crash.mjs"),
      "console.error(`FATAL: API_TOKEN is not set (${process.env.API_TOKEN})`); process.exit(1);",
    );
    const logPath = nativeLogPath(root, "crasher");
    const plan = planNativeRun(
      [
        nativeService(root, "crasher", {
          appType: "migrator",
          command: `${NODE} crash.mjs`,
          env: { API_TOKEN: ref("API_TOKEN") },
        }),
      ],
      { API_TOKEN: token },
      root,
    );
    const lines: string[] = [];
    const supervisor = new NativeSupervisor(
      root,
      plan.services,
      { onLine: (_name, line) => lines.push(line) },
      { baseEnv: { API_TOKEN: token } },
    );
    supervisors.push(supervisor);

    const failures = await supervisor.start();
    const stored = readFileSync(logPath, "utf-8");
    const [failure] = withFailureLogs(root, failures);

    expect(failures).toMatchObject([
      { name: "crasher", reason: "the job did not exit 0; see its output above" },
    ]);
    expect(lines).toContain("FATAL: API_TOKEN is not set ([REDACTED])");
    expect(stored).toContain("FATAL: API_TOKEN is not set ([REDACTED])");
    expect(stored).not.toContain(token);
    expect(failure?.logs?.join("\n")).toContain("FATAL: API_TOKEN is not set ([REDACTED])");
  });
});

describe("shellInvocation", () => {
  it("runs a command line through /bin/sh -c on POSIX, unchanged", () => {
    expect(shellInvocation("PORT=1 node s.js && echo $PORT", "linux")).toEqual({
      file: "/bin/sh",
      args: ["-c", "PORT=1 node s.js && echo $PORT"],
      windowsVerbatimArguments: false,
    });
  });

  it("runs it the way Node's shell option does on Windows: ComSpec /d /s /c with the line quoted verbatim", () => {
    expect(
      shellInvocation("set X=1 && node s.js", "win32", "C:\\Windows\\System32\\cmd.exe"),
    ).toEqual({
      file: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", '"set X=1 && node s.js"'],
      windowsVerbatimArguments: true,
    });
    expect(shellInvocation("node s.js", "win32", undefined).file).toBe("cmd.exe");
  });
});

describe("signalGroup", () => {
  it("ends the whole process tree on Windows, where a kill reaches only the shell", () => {
    const killed: number[] = [];
    signalGroup(4321, "SIGTERM", "win32", (pid) => killed.push(pid));
    expect(killed).toEqual([4321]);
  });

  it("signals the process group on POSIX and never runs taskkill", () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      detached: true,
      stdio: "ignore",
    });
    const pid = child.pid as number;
    const killed: number[] = [];
    signalGroup(pid, "SIGKILL", "linux", (p) => killed.push(p));
    expect(killed).toEqual([]);
    return new Promise<void>((resolve) => child.once("exit", () => resolve()));
  });
});

describe("migrator output propagation (#2864)", () => {
  const ECHO_SERVER = `
import { createServer } from "node:http";
const port = Number(process.env.PORT);
createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200);
    res.end("ok");
  } else if (req.url === "/token") {
    res.writeHead(200);
    res.end(JSON.stringify({
      apiKey: process.env.PLATFORM_API_KEY ?? null,
      secondVal: process.env.EXTRA_VAL ?? null,
      fallbackVal: process.env.FALLBACK_VAL ?? null,
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(port);
`;

  it("propagates single and multiple outputs to dependent service with key renaming", async () => {
    const root = createTempDir();
    writeFileSync(join(root, "echo-server.mjs"), ECHO_SERVER);
    const port = await freePort();

    const plan = planNativeRun([
      nativeService(root, "migrator", {
        appType: "migrator",
        command:
          'printf "SERVICE_TOKEN=token_abc123\\nEXTRA_KEY=extra_value_456\\n" > "$FLISK_OUTPUT"',
      }),
      nativeService(root, "api", {
        command: `${NODE} echo-server.mjs`,
        port,
        healthCheckPath: "/health",
        dependsOn: ["migrator"],
        env: {
          PLATFORM_API_KEY: "${migrator:SERVICE_TOKEN}",
          EXTRA_VAL: "${migrator:EXTRA_KEY}",
          FALLBACK_VAL: "${migrator:MISSING_KEY:-default_fallback}",
        },
      }),
    ]);

    const notes: string[] = [];
    const supervisor = new NativeSupervisor(root, plan.services, {
      onNote: (name, message) => notes.push(`${name}: ${message}`),
    });
    supervisors.push(supervisor);

    const failures = await supervisor.start();
    expect(failures).toEqual([]);
    expect(notes).toContain("migrator: finished (exit code 0)");

    // Verify dependent received the renamed and resolved environment variables
    const res = await fetch(localUrl(port, "/token"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      apiKey: "token_abc123",
      secondVal: "extra_value_456",
      fallbackVal: "default_fallback",
    });

    // Verify supervisor recorded parsed outputs
    expect(supervisor.outputsOf("migrator")).toEqual({
      SERVICE_TOKEN: "token_abc123",
      EXTRA_KEY: "extra_value_456",
    });
  });

  it("binds a command reference to migrator output at spawn time, not at planning time", async () => {
    const root = createTempDir();
    writeFileSync(
      join(root, "dump-late.mjs"),
      `import { writeFileSync } from "node:fs";
writeFileSync("late.json", process.argv[2] ?? "");`,
    );

    const plan = planNativeRun([
      nativeService(root, "migrator", {
        appType: "migrator",
        command: 'printf "SERVICE_TOKEN=token_late_789\\n" > "$FLISK_OUTPUT"',
      }),
      nativeService(root, "api", {
        command: `${NODE} dump-late.mjs "${ref("TOKEN")}"`,
        dependsOn: ["migrator"],
        env: { TOKEN: "${migrator:SERVICE_TOKEN}" },
      }),
    ]);

    const supervisor = new NativeSupervisor(root, plan.services);
    supervisors.push(supervisor);
    const failures = await supervisor.start();
    expect(failures).toEqual([]);
    await waitFor(() => existsSync(join(root, "late.json")));
    // The shell expands ${TOKEN} at launch, after resolveServiceEnv put the migrator's real output into the env;
    // the placeholder never reaches the process.
    expect(readFileSync(join(root, "late.json"), "utf-8")).toBe("token_late_789");
  });

  it("rebinds the health path and probe words that reference migrator output", async () => {
    const root = createTempDir();
    writeFileSync(
      join(root, "health-recorder.mjs"),
      `import { createServer } from "node:http";
import { appendFileSync } from "node:fs";
const port = Number(process.env.PORT);
createServer((req, res) => {
  appendFileSync("health-urls.jsonl", req.url + "\\n");
  res.writeHead(req.url.startsWith("/health") ? 200 : 404);
  res.end();
}).listen(port);`,
    );
    writeFileSync(
      join(root, "probe-late.mjs"),
      `import { writeFileSync } from "node:fs";
writeFileSync("probe-late.json", process.argv[2] ?? "");`,
    );
    const port = await freePort();

    const plan = planNativeRun([
      nativeService(root, "migrator", {
        appType: "migrator",
        command: 'printf "SERVICE_TOKEN=token_health_456\\n" > "$FLISK_OUTPUT"',
      }),
      nativeService(root, "api", {
        command: `${NODE} health-recorder.mjs`,
        port,
        dependsOn: ["migrator"],
        env: { TOKEN: "${migrator:SERVICE_TOKEN}" },
        healthCheckPath: `/health?token=${ref("TOKEN")}`,
      }),
      nativeService(root, "worker", {
        command: "sleep 30",
        dependsOn: ["migrator"],
        env: { TOKEN: "${migrator:SERVICE_TOKEN}" },
        healthCheck: { command: [process.execPath, "probe-late.mjs", ref("TOKEN")] },
      }),
    ]);

    const supervisor = new NativeSupervisor(root, plan.services);
    supervisors.push(supervisor);
    const failures = await supervisor.start();
    expect(failures).toEqual([]);

    // The health URL was probed with the bound token, not the planning-time placeholder.
    const urls = readFileSync(join(root, "health-urls.jsonl"), "utf-8");
    expect(urls).toContain("token_health_456");
    expect(urls).not.toContain("migrator:SERVICE_TOKEN");
    // The probe words were re-expanded after the migrator finished.
    await waitFor(() => existsSync(join(root, "probe-late.json")));
    expect(readFileSync(join(root, "probe-late.json"), "utf-8")).toBe("token_health_456");
  });

  it("refuses a migrator reference in a health path that is not a dependsOn migrator", () => {
    const root = createTempDir();
    const plan = planNativeRun([
      nativeService(root, "migrator", { appType: "migrator", command: "exit 0" }),
      nativeService(root, "api", {
        command: "node server.js",
        port: 4100,
        healthCheckPath: `/ready?token=${ref("migrator:SERVICE_TOKEN")}`,
      }),
    ]);

    expect(
      plan.errors.some((err) => err.includes('references unauthorized output from "migrator"')),
    ).toBe(true);
  });

  it("rejects unauthorized output references at plan time when not in dependsOn", () => {
    const root = createTempDir();
    const plan = planNativeRun([
      nativeService(root, "migrator", { appType: "migrator", command: "exit 0" }),
      nativeService(root, "unrelated-api", {
        command: "node server.js",
        dependsOn: [], // Missing "migrator"
        env: {
          SECRET: "${migrator:SERVICE_TOKEN}",
        },
      }),
    ]);

    expect(plan.errors.length).toBeGreaterThan(0);
    expect(
      plan.errors.some((err) => err.includes('references unauthorized output from "migrator"')),
    ).toBe(true);
  });

  it("blocks dependent when migrator fails and does not reuse stale outputs", async () => {
    const root = createTempDir();
    writeFileSync(join(root, "echo-server.mjs"), ECHO_SERVER);
    const port = await freePort();

    // First, simulate a stale output file left from a previous run
    const outputPath = join(root, ".flisk", "outputs", "migrator.env");
    mkdirSync(join(root, ".flisk", "outputs"), { recursive: true });
    writeFileSync(outputPath, "SERVICE_TOKEN=stale_old_token\n");

    const plan = planNativeRun([
      nativeService(root, "migrator", {
        appType: "migrator",
        command: "exit 1", // Failed migrator
      }),
      nativeService(root, "api", {
        command: `${NODE} echo-server.mjs`,
        port,
        dependsOn: ["migrator"],
        env: {
          PLATFORM_API_KEY: "${migrator:SERVICE_TOKEN}",
        },
      }),
    ]);

    const supervisor = new NativeSupervisor(root, plan.services);
    supervisors.push(supervisor);

    const failures = await supervisor.start();
    expect(failures).toEqual([
      { name: "migrator", reason: "the job did not exit 0; see its output above" },
      { name: "api", reason: "not started: migrator did not start" },
    ]);

    // Stale output must be deleted on failure
    expect(existsSync(outputPath)).toBe(false);
    expect(supervisor.pidOf("api")).toBeUndefined();
  });

  it("fails dependent when migrator does not produce expected output and no fallback is given", async () => {
    const root = createTempDir();
    writeFileSync(join(root, "echo-server.mjs"), ECHO_SERVER);
    const port = await freePort();

    const plan = planNativeRun([
      nativeService(root, "migrator", {
        appType: "migrator",
        command: 'printf "OTHER_KEY=value\\n" > "$FLISK_OUTPUT"',
      }),
      nativeService(root, "api", {
        command: `${NODE} echo-server.mjs`,
        port,
        dependsOn: ["migrator"],
        env: {
          REQUIRED_TOKEN: "${migrator:MISSING_TOKEN}",
        },
      }),
    ]);

    const supervisor = new NativeSupervisor(root, plan.services);
    supervisors.push(supervisor);

    const failures = await supervisor.start();
    expect(failures.length).toBeGreaterThan(0);
    const apiFailure = failures.find((f) => f.name === "api");
    expect(apiFailure?.reason).toContain(
      'Migrator "migrator" did not produce expected output "MISSING_TOKEN"',
    );
  });

  it("refreshes output on repeated run and never leaks sentinel secrets to logs or state", async () => {
    const root = createTempDir();
    writeFileSync(join(root, "echo-server.mjs"), ECHO_SERVER);
    const port = await freePort();
    const SENTINEL_SECRET = "SENTINEL_SECRET_ALPHA_9999_NEVER_LEAK";

    // Write a seeder script that outputs the secret to $FLISK_OUTPUT dynamically
    writeFileSync(
      join(root, "seeder.mjs"),
      `import { writeFileSync } from "node:fs";
const token = process.env.SEEDED_TOKEN;
writeFileSync(process.env.FLISK_OUTPUT, "SERVICE_TOKEN=" + token + "\\n");
`,
    );

    // Run 1: writes sentinel secret
    const plan1 = planNativeRun([
      nativeService(root, "migrator", {
        appType: "migrator",
        command: `${NODE} seeder.mjs`,
        env: { SEEDED_TOKEN: SENTINEL_SECRET },
      }),
      nativeService(root, "api", {
        command: `${NODE} echo-server.mjs`,
        port,
        healthCheckPath: "/health",
        dependsOn: ["migrator"],
        env: {
          PLATFORM_API_KEY: "${migrator:SERVICE_TOKEN}",
        },
      }),
    ]);

    const notes: string[] = [];
    const supervisor1 = new NativeSupervisor(root, plan1.services, {
      onNote: (name, message) => notes.push(`${name}: ${message}`),
    });
    supervisors.push(supervisor1);

    expect(await supervisor1.start()).toEqual([]);

    // Check that secret was NOT leaked into notes
    expect(notes.some((n) => n.includes(SENTINEL_SECRET))).toBe(false);

    // Check that secret was NOT saved in state file
    const runStateContent = readFileSync(join(root, ".flisk", "native", "run.json"), "utf8");
    expect(runStateContent.includes(SENTINEL_SECRET)).toBe(false);

    await supervisor1.stop();

    // Run 2: refreshed with new token
    const NEW_SECRET = "NEW_REFRESHED_SECRET_8888";
    const port2 = await freePort();
    const plan2 = planNativeRun([
      nativeService(root, "migrator", {
        appType: "migrator",
        command: `${NODE} seeder.mjs`,
        env: { SEEDED_TOKEN: NEW_SECRET },
      }),
      nativeService(root, "api", {
        command: `${NODE} echo-server.mjs`,
        port: port2,
        healthCheckPath: "/health",
        dependsOn: ["migrator"],
        env: {
          PLATFORM_API_KEY: "${migrator:SERVICE_TOKEN}",
        },
      }),
    ]);

    const supervisor2 = new NativeSupervisor(root, plan2.services);
    supervisors.push(supervisor2);

    expect(await supervisor2.start()).toEqual([]);
    const res = await fetch(localUrl(port2, "/token"));
    const data = await res.json();
    expect(data.apiKey).toBe(NEW_SECRET);
    expect(data.apiKey).not.toBe(SENTINEL_SECRET);
  });
});
