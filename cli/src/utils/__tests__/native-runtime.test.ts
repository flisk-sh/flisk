// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTempDir, makeResource } from "../../test-support/index.js";
import {
  dependencyWaves,
  expandEnvValue,
  findMissingPrograms,
  isProcessAlive,
  localUrl,
  NativeSupervisor,
  nativeLogPath,
  nativeRunStatePath,
  planNativeRun,
  readNativeLogLines,
  readNativeRunState,
  shellInvocation,
  signalGroup,
  stopNativeRun,
} from "../native-runtime.js";

const NODE = JSON.stringify(process.execPath);

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
        env: { PORT: "4100" },
        dependsOn: [],
        healthUrl: localUrl(4100, "/health"),
        url: localUrl(4100),
        restart: false,
      },
      expect.objectContaining({
        name: "web",
        env: { API_URL: localUrl(4100), TOKEN: "s3", PORT: "3100" },
        dependsOn: ["api"],
        healthUrl: undefined,
        restart: true,
      }),
    ]);
  });

  it("refuses a dependsOn on infrastructure the native runtime cannot start, and a shared port", () => {
    const plan = planNativeRun([
      makeResource("api", "bring-your-own", { command: "x", port: 4100, dependsOn: ["postgres"] }),
      makeResource("web", "bring-your-own", { command: "y", port: 4100 }),
    ]);
    expect(plan.errors).toEqual([
      expect.stringMatching(
        /^service "api" dependsOn "postgres", which is not a service with a command/,
      ),
      'services "api" and "web" both use port 4100',
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

describe("native supervisor", () => {
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

  it("stops restarting a service that keeps exiting, and reports it", async () => {
    const root = createTempDir();
    const plan = planNativeRun([nativeService(root, "job", { command: "exit 3" })]);
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
});

describe("stopping a native run from another process", () => {
  it("stops service processes a killed supervisor left behind", async () => {
    const root = createTempDir();
    const orphan = spawn("sleep", ["300"], { detached: true, stdio: "ignore" });
    orphan.unref();
    const deadSupervisor = spawn(process.execPath, ["-e", ""]);
    await new Promise((resolve) => deadSupervisor.once("exit", resolve));
    mkdirSync(join(root, ".flisk", "native"), { recursive: true });
    writeFileSync(
      nativeRunStatePath(root),
      JSON.stringify({
        pid: deadSupervisor.pid,
        startedAt: new Date().toISOString(),
        services: { api: { pid: orphan.pid } },
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
