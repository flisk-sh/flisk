// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { type ChildProcess, type SpawnOptions, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanEnv,
  createTempDir,
  createTempProject,
  fliskBin,
  parseEnvelope,
  runCommandInProcess,
  runFlisk,
} from "../../test-support/index.js";
import { FliskError } from "../../utils/errors.js";
import { JsonCommandError } from "../../utils/json-command.js";
import {
  appBundles,
  type FliskOsHost,
  fliskOsArgs,
  launchFliskOs,
  locateFliskOs,
  notInstalledError,
  type OsDeps,
  osCommand,
  parsePort,
  resolveOsProject,
  runOs,
} from "../os.js";

const RUNNING = "FliskOS is running at http://127.0.0.1:4321\n";

function host(overrides: Partial<FliskOsHost> = {}): FliskOsHost {
  return {
    platform: "darwin",
    home: "/Users/test",
    findCommand: () => null,
    exists: () => false,
    ...overrides,
  };
}

type FakeChild = EventEmitter & { stdout: EventEmitter; kill: ReturnType<typeof vi.fn> };

interface SpawnCall {
  command: string;
  args: string[];
  options: SpawnOptions;
  child: FakeChild;
}

/** A spawn double. `script` runs once the caller has attached its listeners, and decides how the child behaves. */
function fakeSpawn(script: (child: FakeChild) => void = (child) => child.emit("close", 0)) {
  const calls: SpawnCall[] = [];
  const spawnFn = ((command: string, args: string[], options: SpawnOptions) => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      kill: vi.fn(),
    }) as FakeChild;
    calls.push({ command, args, options, child });
    queueMicrotask(() => script(child));
    return child as unknown as ChildProcess;
  }) as OsDeps["spawn"];
  return { calls, spawnFn };
}

const onPath = (path: string) =>
  host({ findCommand: (name) => (name === "fliskos" ? path : null) });

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("locateFliskOs", () => {
  it("prefers the fliskos command over an installed app", () => {
    const found = locateFliskOs(
      host({ findCommand: () => "/usr/local/bin/fliskos", exists: () => true }),
    );
    expect(found).toEqual({ via: "command", path: "/usr/local/bin/fliskos" });
  });

  it.each([["/Applications/FliskOS.app"], ["/Users/test/Applications/FliskOS.app"]])(
    "falls back to %s on macOS",
    (bundle) => {
      const found = locateFliskOs(host({ exists: (path) => path === bundle }));
      expect(found).toEqual({ via: "app", path: bundle });
    },
  );

  it("looks in the system folder before the user's", () => {
    expect(appBundles({ home: "/Users/test" })).toEqual([
      "/Applications/FliskOS.app",
      "/Users/test/Applications/FliskOS.app",
    ]);
  });

  it("does not look for the app off macOS", () => {
    expect(locateFliskOs(host({ platform: "linux", exists: () => true }))).toBeNull();
  });

  it("finds nothing on a machine without either", () => {
    expect(locateFliskOs(host())).toBeNull();
  });
});

describe("fliskOsArgs", () => {
  it("forwards the project, port, --no-open and every scan root", () => {
    expect(
      fliskOsArgs({
        project: "/work/shop",
        port: 4300,
        open: false,
        scanRoots: ["/work", "/code"],
      }),
    ).toEqual([
      "--project",
      "/work/shop",
      "--port",
      "4300",
      "--no-open",
      "--scan-root",
      "/work",
      "--scan-root",
      "/code",
    ]);
  });

  it("passes nothing for options that were not given", () => {
    expect(fliskOsArgs({ project: null })).toEqual([]);
    expect(fliskOsArgs({ project: null, open: true, scanRoots: [] })).toEqual([]);
  });

  it("forwards port 0, which asks FliskOS for a free port", () => {
    expect(fliskOsArgs({ project: null, port: 0 })).toEqual(["--port", "0"]);
  });
});

describe("parsePort", () => {
  it.each([
    ["0", 0],
    ["4300", 4300],
    ["65535", 65535],
  ])("accepts %s", (value, port) => {
    expect(parsePort(value)).toBe(port);
  });

  it.each(["abc", "-1", "65536", "4.5", "", " "])("rejects %j with a hint", (value) => {
    try {
      parsePort(value);
      expect.unreachable("parsePort should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(FliskError);
      expect((error as FliskError).suggestions.length).toBeGreaterThan(0);
    }
  });
});

describe("resolveOsProject", () => {
  it("uses the project around the current folder", () => {
    const root = createTempProject();
    mkdirSync(join(root, "services", "api"), { recursive: true });
    expect(resolveOsProject(undefined, root)).toBe(root);
    expect(resolveOsProject(undefined, join(root, "services", "api"))).toBe(root);
  });

  it("is null outside a project, so FliskOS finds the projects itself", () => {
    expect(resolveOsProject(undefined, createTempDir())).toBeNull();
  });

  it("opens the project at --project from anywhere", () => {
    const root = createTempProject();
    expect(resolveOsProject(root, createTempDir())).toBe(root);
  });

  it("refuses a --project that is not a Flisk project", () => {
    const dir = createTempDir();
    expect(() => resolveOsProject(dir, "/")).toThrow(FliskError);
    expect(() => resolveOsProject(dir, "/")).toThrow(/No Flisk project at/);
  });
});

describe("notInstalledError", () => {
  it("says how to install it on macOS, without installing anything", () => {
    const error = notInstalledError("darwin");
    expect(error).toBeInstanceOf(FliskError);
    expect(error.code).toBe("FLISKOS_NOT_INSTALLED");
    expect(error.exitCode).toBe(1);
    const hints = error.suggestions.join("\n");
    expect(hints).toContain("npm install --global @flisk-sh/fliskos");
    expect(hints).toContain("npm run install:mac");
    expect(hints).toContain("https://github.com/flisk-sh/fliskos");
  });

  it("leaves out the macOS app elsewhere", () => {
    const error = notInstalledError("linux");
    expect(error.message).not.toContain("FliskOS.app");
    const hints = error.suggestions.join("\n");
    expect(hints).toContain("npm install --global @flisk-sh/fliskos");
    expect(hints).not.toContain("install:mac");
  });
});

describe("launchFliskOs: the fliskos command", () => {
  it("runs it with the current project and forwards --port, --no-open and --scan-root", async () => {
    const root = createTempProject();
    const { calls, spawnFn } = fakeSpawn((child) => child.emit("close", 3));
    const launch = await launchFliskOs(
      { port: "4300", open: false, scanRoot: ["code", "/abs/projects"] },
      { host: onPath("/opt/bin/fliskos"), spawn: spawnFn, cwd: root },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      command: "/opt/bin/fliskos",
      args: [
        "--project",
        root,
        "--port",
        "4300",
        "--no-open",
        "--scan-root",
        join(root, "code"),
        "--scan-root",
        "/abs/projects",
      ],
      options: { cwd: root, stdio: "inherit" },
    });
    expect(launch.report).toMatchObject({
      via: "command",
      path: "/opt/bin/fliskos",
      project: root,
    });
    expect(await launch.finished).toBe(3);
  });

  it("passes no --project outside a project", async () => {
    const dir = createTempDir();
    const { calls, spawnFn } = fakeSpawn();
    const launch = await launchFliskOs(
      {},
      { host: onPath("/opt/bin/fliskos"), spawn: spawnFn, cwd: dir },
    );
    expect(calls[0]?.args).toEqual([]);
    expect(launch.report.project).toBeNull();
    expect(await launch.finished).toBe(0);
  });

  it("opens the project named by --project from another folder", async () => {
    const root = createTempProject();
    const { calls, spawnFn } = fakeSpawn();
    await launchFliskOs(
      { project: root },
      { host: onPath("/opt/bin/fliskos"), spawn: spawnFn, cwd: createTempDir() },
    );
    expect(calls[0]?.args).toEqual(["--project", root]);
  });

  it("never starts FliskOS for an invalid port or a project that does not exist", async () => {
    const { calls, spawnFn } = fakeSpawn();
    const deps = { host: onPath("/opt/bin/fliskos"), spawn: spawnFn, cwd: createTempDir() };
    await expect(launchFliskOs({ port: "http" }, deps)).rejects.toThrow(/--port must be/);
    await expect(launchFliskOs({ project: deps.cwd }, deps)).rejects.toThrow(/No Flisk project/);
    expect(calls).toEqual([]);
  });

  it("reports a command that cannot start as an error with a hint", async () => {
    const { spawnFn } = fakeSpawn((child) =>
      child.emit("error", Object.assign(new Error("spawn EACCES"), { code: "EACCES" })),
    );
    const launch = await launchFliskOs(
      {},
      { host: onPath("/opt/bin/fliskos"), spawn: spawnFn, cwd: createTempDir() },
    );
    const error = await launch.finished.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(FliskError);
    expect((error as FliskError).message).toContain("Could not start /opt/bin/fliskos");
    expect((error as FliskError).suggestions.length).toBeGreaterThan(0);
  });
});

describe("launchFliskOs: FliskOS.app", () => {
  const appHost = (extra: Partial<FliskOsHost> = {}) =>
    host({ exists: (path) => path === "/Applications/FliskOS.app", ...extra });

  it("opens the app with open -a FliskOS when the command is not on PATH", async () => {
    const { calls, spawnFn } = fakeSpawn();
    const launch = await launchFliskOs(
      {},
      {
        host: appHost({ findCommand: (name) => (name === "open" ? "/usr/bin/open" : null) }),
        spawn: spawnFn,
        cwd: createTempDir(),
      },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ command: "/usr/bin/open", args: ["-a", "FliskOS"] });
    expect(launch.report).toEqual({
      via: "app",
      path: "/Applications/FliskOS.app",
      args: ["-a", "FliskOS"],
      project: null,
      url: null,
      ignored: [],
    });
    expect(await launch.finished).toBe(0);
  });

  it("names the options the app cannot take instead of dropping them silently", async () => {
    const { spawnFn } = fakeSpawn();
    const launch = await launchFliskOs(
      { port: "4300", open: false, scanRoot: ["code"] },
      { host: appHost(), spawn: spawnFn, cwd: createTempDir() },
    );
    expect(launch.report.ignored).toEqual(["--port", "--no-open", "--scan-root"]);
    expect(vi.mocked(console.log).mock.calls.flat().join("\n")).toContain(
      "does not take --port, --no-open, --scan-root",
    );
  });

  it("does not count the project found from the current folder as ignored", async () => {
    const { spawnFn } = fakeSpawn();
    const launch = await launchFliskOs(
      {},
      { host: appHost(), spawn: spawnFn, cwd: createTempProject() },
    );
    expect(launch.report.ignored).toEqual([]);
  });

  it("fails with a hint when open does not start the app", async () => {
    const { spawnFn } = fakeSpawn((child) => child.emit("close", 1));
    await expect(
      launchFliskOs({}, { host: appHost(), spawn: spawnFn, cwd: createTempDir() }),
    ).rejects.toThrow(/open could not start FliskOS\.app/);
  });
});

describe("launchFliskOs: nothing installed", () => {
  it("fails with how to install it and starts nothing", async () => {
    const { calls, spawnFn } = fakeSpawn();
    const error = await launchFliskOs(
      {},
      { host: host(), spawn: spawnFn, cwd: createTempDir() },
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(FliskError);
    expect((error as FliskError).message).toContain("FliskOS is not installed");
    expect((error as FliskError).suggestions.join("\n")).toContain(
      "npm install --global @flisk-sh/fliskos",
    );
    expect((error as FliskError).exitCode).toBe(1);
    // Never installs on its own: no npm, bun or any other process is started.
    expect(calls).toEqual([]);
  });
});

describe("launchFliskOs --json", () => {
  const jsonDeps = (spawnFn: OsDeps["spawn"], extra: Partial<OsDeps> = {}) => ({
    host: onPath("/opt/bin/fliskos"),
    spawn: spawnFn,
    cwd: createTempDir(),
    ...extra,
  });

  it("pipes the command's output and reads where it listens from it", async () => {
    const { calls, spawnFn } = fakeSpawn((child) => {
      child.stdout.emit("data", Buffer.from("starting\nFliskOS is running at http://127.0.0.1:"));
      child.stdout.emit("data", Buffer.from("4321\nPress Ctrl+C\n"));
    });
    const launch = await launchFliskOs({ json: true }, jsonDeps(spawnFn));
    expect(calls[0]?.options.stdio).toEqual(["inherit", "pipe", "inherit"]);
    expect(launch.report.url).toBe("http://127.0.0.1:4321");
    // Its output goes to stderr, so stdout stays free for the envelope.
    expect(
      vi
        .mocked(process.stderr.write)
        .mock.calls.map(([chunk]) => String(chunk))
        .join(""),
    ).toContain("FliskOS is running at");
    calls[0]?.child.emit("close", 0);
    expect(await launch.finished).toBe(0);
  });

  it("fails with FLISKOS_FAILED when the command exits before it listens", async () => {
    const { spawnFn } = fakeSpawn((child) => child.emit("close", 2));
    const error = await launchFliskOs({ json: true }, jsonDeps(spawnFn)).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(JsonCommandError);
    expect((error as JsonCommandError).code).toBe("FLISKOS_FAILED");
    expect((error as JsonCommandError).exitCode).toBe(2);
  });

  it("gives up and stops the command when it never says where it listens", async () => {
    const sigtermBefore = process.listenerCount("SIGTERM");
    const { calls, spawnFn } = fakeSpawn(() => {});
    const error = await launchFliskOs(
      { json: true },
      jsonDeps(spawnFn, { readyTimeoutMs: 20 }),
    ).catch((caught: unknown) => caught);
    expect((error as JsonCommandError).code).toBe("FLISKOS_FAILED");
    expect((error as JsonCommandError).message).toContain("did not say where it listens");
    expect(calls[0]?.child.kill).toHaveBeenCalled();
    // A real child closes once it is killed; that is what puts the signal handlers back.
    calls[0]?.child.emit("close", null);
    await new Promise((resolve) => setImmediate(resolve));
    expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore);
  });
});

describe("runOs envelopes", () => {
  /** Runs `runOs` the way the command does, in the folder, and captures what it printed. */
  function run(options: Parameters<typeof runOs>[0], deps: Partial<OsDeps>, cwd: string) {
    const command = new Command("os-test").action(async () => {
      await runOs(options, deps);
    });
    return runCommandInProcess(command, [], cwd);
  }

  it("prints one envelope on stdout once FliskOS is up", async () => {
    const root = createTempProject();
    const { spawnFn, calls } = fakeSpawn((child) => {
      child.stdout.emit("data", Buffer.from(RUNNING));
      child.emit("close", 0);
    });
    const result = await run(
      { json: true, port: "4300" },
      { host: onPath("/opt/bin/fliskos"), spawn: spawnFn },
      root,
    );
    expect(result.status).toBeUndefined();
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope).toEqual({
      schemaVersion: 1,
      data: {
        via: "command",
        path: "/opt/bin/fliskos",
        args: ["--project", root, "--port", "4300"],
        project: root,
        url: "http://127.0.0.1:4321",
        ignored: [],
      },
      errors: [],
    });
    expect(calls).toHaveLength(1);
  });

  it("reports the app in the same envelope", async () => {
    const { spawnFn } = fakeSpawn();
    const result = await run(
      { json: true },
      { host: host({ exists: (path) => path === "/Applications/FliskOS.app" }), spawn: spawnFn },
      createTempDir(),
    );
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.errors).toEqual([]);
    expect(envelope.data).toMatchObject({
      via: "app",
      path: "/Applications/FliskOS.app",
      args: ["-a", "FliskOS"],
      url: null,
    });
  });

  it("reports a machine without FliskOS as a failure envelope with the install hints", async () => {
    const { spawnFn, calls } = fakeSpawn();
    const result = await run({ json: true }, { host: host(), spawn: spawnFn }, createTempDir());
    expect(result.status).toBe(1);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.data).toBeNull();
    expect(envelope.errors).toHaveLength(1);
    expect(envelope.errors[0]).toMatchObject({ code: "FLISKOS_NOT_INSTALLED" });
    expect(JSON.stringify(envelope.errors[0])).toContain("npm install --global @flisk-sh/fliskos");
    expect(calls).toEqual([]);
  });

  it("reports a usage error as COMMAND_FAILED", async () => {
    const { spawnFn } = fakeSpawn();
    const result = await run(
      { json: true, port: "many" },
      { host: onPath("/opt/bin/fliskos"), spawn: spawnFn },
      createTempDir(),
    );
    expect(result.status).toBe(1);
    expect(parseEnvelope(result.stdout).errors[0]).toMatchObject({ code: "COMMAND_FAILED" });
  });

  it("prints the install hints for a person and exits 1", async () => {
    const { spawnFn } = fakeSpawn();
    const result = await run({}, { host: host(), spawn: spawnFn }, createTempDir());
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("FliskOS is not installed");
    expect(result.stderr).toContain("npm install --global @flisk-sh/fliskos");
    expect(result.stderr).toContain("npm run install:mac");
  });
});

describe("flisk os (the real CLI)", () => {
  /** A directory with a `fliskos` stub that writes its arguments, one per line, to `$ARGS_FILE`. */
  function stubDir(body: string): { dir: string; path: string; argsFile: string } {
    const dir = createTempDir("flisk-os-stub-");
    const argsFile = join(dir, "args.txt");
    writeFileSync(
      join(dir, "fliskos"),
      `#!/bin/sh\nfor a in "$@"; do printf '%s\\n' "$a"; done > "$ARGS_FILE"\n${body}\n`,
      { mode: 0o755 },
    );
    // /usr/bin and /bin hold the tools the stub uses; neither has a fliskos.
    return { dir, path: `${dir}:/usr/bin:/bin`, argsFile };
  }

  const args = (file: string) => readFileSync(file, "utf-8").trimEnd().split("\n");

  it("starts fliskos for the current project and forwards the options", () => {
    const root = createTempProject();
    const folder = join(root, "services");
    mkdirSync(folder, { recursive: true });
    const stub = stubDir(`echo "${RUNNING.trim()}"`);
    const result = runFlisk(
      ["os", "--port", "4300", "--no-open", "--scan-root", "one", "--scan-root", "two"],
      { cwd: folder, env: { PATH: stub.path, ARGS_FILE: stub.argsFile } },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("FliskOS is running at http://127.0.0.1:4321");
    expect(args(stub.argsFile)).toEqual([
      "--project",
      root,
      "--port",
      "4300",
      "--no-open",
      "--scan-root",
      join(folder, "one"),
      "--scan-root",
      join(folder, "two"),
    ]);
  });

  it("reads the root --project option, which Commander gives to the root program", () => {
    const root = createTempProject();
    const stub = stubDir("true");
    const result = runFlisk(["os", "--project", root], {
      cwd: createTempDir(),
      env: { PATH: stub.path, ARGS_FILE: stub.argsFile },
    });
    expect(result.status).toBe(0);
    expect(args(stub.argsFile)).toEqual(["--project", root]);
  });

  it("rejects a --project that is not a Flisk project before starting anything", () => {
    const stub = stubDir("true");
    const result = runFlisk(["os", "--project", createTempDir()], {
      cwd: createTempDir(),
      env: { PATH: stub.path, ARGS_FILE: stub.argsFile },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No Flisk project at");
    expect(existsSync(stub.argsFile)).toBe(false);
  });

  it("exits with the exit code of fliskos", () => {
    const stub = stubDir("exit 3");
    const result = runFlisk(["os"], {
      cwd: createTempDir(),
      env: { PATH: stub.path, ARGS_FILE: stub.argsFile },
    });
    expect(result.status).toBe(3);
  });

  it("prints exactly one envelope line on stdout with --json", () => {
    const root = createTempProject();
    const stub = stubDir(`echo "${RUNNING.trim()}"`);
    const result = runFlisk(["os", "--json"], {
      cwd: root,
      env: { PATH: stub.path, ARGS_FILE: stub.argsFile },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^\{[^\n]*\}\n$/);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.errors).toEqual([]);
    expect(envelope.data).toMatchObject({
      via: "command",
      path: join(stub.path.split(":")[0] as string, "fliskos"),
      project: root,
      url: "http://127.0.0.1:4321",
    });
    // What fliskos printed went to stderr.
    expect(result.stderr).toContain("FliskOS is running at");
  });

  it("passes SIGTERM on to fliskos, so it does not keep its port", async () => {
    const dir = createTempDir("flisk-os-term-");
    const stub = stubDir(
      `echo $$ > "${join(dir, "pid")}"\n` +
        `trap 'echo term > "${join(dir, "term")}"; exit 0' TERM\n` +
        `echo "${RUNNING.trim()}"\n` +
        "while :; do sleep 0.1; done",
    );
    const child = spawn(process.execPath, [fliskBin, "os", "--json"], {
      cwd: dir,
      env: cleanEnv({ NO_COLOR: "1", PATH: stub.path, ARGS_FILE: stub.argsFile }),
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      // The envelope goes out once fliskos listens.
      await new Promise<void>((resolve, reject) => {
        let out = "";
        child.stdout?.on("data", (chunk: Buffer) => {
          out += chunk.toString();
          if (out.includes("\n")) resolve();
        });
        child.once("error", reject);
        child.once("close", () => reject(new Error(`flisk os exited early: ${out}`)));
      });
      // "exit", not "close": an orphaned fliskos would keep flisk's pipes open and hide the failure behind a timeout.
      const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      expect(await exited).toBe(0);
      expect(readFileSync(join(dir, "term"), "utf-8").trim()).toBe("term");
    } finally {
      child.kill("SIGKILL");
      if (existsSync(join(dir, "pid"))) {
        try {
          process.kill(Number(readFileSync(join(dir, "pid"), "utf-8").trim()), "SIGKILL");
        } catch {
          // Already gone, which is the point of the test.
        }
      }
    }
  });
});

describe("the os command", () => {
  it("is described, and takes the options fliskos takes", () => {
    expect(osCommand.name()).toBe("os");
    expect(osCommand.description()).toContain("FliskOS");
    const flags = osCommand.options.map((option) => option.long);
    expect(flags).toEqual(["--project", "--port", "--no-open", "--scan-root", "--json"]);
  });

  it("is not the terminal dashboard", () => {
    expect(osCommand.aliases()).toEqual([]);
  });
});
