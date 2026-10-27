// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/// <reference types="vite/client" />

import { EventEmitter } from "node:events";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRegisteredCommands } from "../../commands/registry.js";
import { CREATABLE_RESOURCE_TYPES } from "../../types/index.js";
import { FliskError } from "../../utils/errors.js";
import { PROJECT_TEMPLATES } from "../../utils/project-templates.js";
import {
  buildConfigRegenerateArgs,
  buildLogsArgs,
  buildProjectEjectArgs,
  buildProjectImportArgs,
  buildProjectInitArgs,
  buildResourceCreateArgs,
  buildStackAssignArgs,
  buildUpArgs,
  cliInvocation,
  createFliskTools,
  defaultUpDeps,
  type FliskRun,
  runFliskCli,
  startUp,
  toTextResult,
  toToolResult,
  type UpDeps,
} from "../tools.js";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: spawnMock,
}));

beforeEach(() => {
  spawnMock.mockReset();
});

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../../../..");

function loadRegisteredCommandMap(): Map<string, Command> {
  const byName = new Map<string, Command>();
  for (const cmd of getRegisteredCommands()) {
    byName.set(cmd.name(), cmd);
    for (const alias of cmd.aliases()) byName.set(alias, cmd);
  }
  return byName;
}

/** Validate `flisk <subcommand> ...` usage snippets against registered Commander commands. */
function checkDocCliInvocations(docText: string, commands: Map<string, Command>): string[] {
  const problems: string[] = [];
  const matches = [
    ...docText.matchAll(/`flisk\s+([a-z][\w-]*)(?:\s+([^`\n]*))?`/g),
    ...docText.matchAll(/^\s*flisk\s+([a-z][\w-]*)(?:\s+([^\n]*))?$/gm),
  ];
  for (const match of matches) {
    const subName = match[1];
    const rest = (match[2] ?? "").trim();
    const rootCmd = commands.get(subName);
    // `flisk <template>` (e.g. `flisk demo`) is a bare template dispatch, not a Commander command.
    if (!rootCmd && rest === "" && subName in PROJECT_TEMPLATES) {
      continue;
    }
    if (!rootCmd) {
      problems.push(`unknown command "flisk ${subName}"`);
      continue;
    }

    let targetCmd: Command = rootCmd;
    let tokens = rest ? rest.split(/\s+/) : [];
    if (tokens.length > 0 && rootCmd.commands.length > 0) {
      const sub = rootCmd.commands.find(
        (c) => c.name() === tokens[0] || c.aliases().includes(tokens[0]),
      );
      if (sub) {
        targetCmd = sub;
        tokens = tokens.slice(1);
      }
    }

    const validFlags = new Set(
      targetCmd.options.flatMap((opt) => [opt.long, opt.short].filter(Boolean) as string[]),
    );
    let idx = 0;
    let positionalCount = 0;
    while (idx < tokens.length) {
      const raw = tokens[idx];
      const stripped = raw.replace(/^\[+|\]+$/g, "");
      if (!stripped) {
        idx += 1;
        continue;
      }
      if (stripped.startsWith("-")) {
        const flagName = stripped.split("=")[0];
        if (!validFlags.has(flagName)) {
          problems.push(`flisk ${targetCmd.name()}: unknown flag "${flagName}" in "${match[0]}"`);
        }
        const opt = targetCmd.options.find((o) => o.long === flagName || o.short === flagName);
        if (
          opt &&
          (opt.required || opt.optional) &&
          !stripped.includes("=") &&
          idx + 1 < tokens.length &&
          !tokens[idx + 1].replace(/^\[+|\]+$/g, "").startsWith("-")
        ) {
          idx += 2;
          continue;
        }
      } else {
        positionalCount += 1;
      }
      idx += 1;
    }

    if (positionalCount > targetCmd.registeredArguments.length) {
      problems.push(
        `flisk ${targetCmd.name()} takes ${targetCmd.registeredArguments.length} positional argument(s), but doc has ${positionalCount} in "${match[0]}"`,
      );
    }
  }
  return problems;
}

/** What in a tool's `flisk <args>` its command does not declare: unknown options, or more positionals than it takes. */
function undeclaredArguments(args: string[], commands: Map<string, Command>): string[] {
  const [name = "", ...rest] = args;
  const root = commands.get(name);
  if (!root) return [`unknown command "flisk ${name}"`];
  const sub = root.commands.find((c) => c.name() === rest[0]);
  const target = sub ?? root;
  const tokens = sub ? rest.slice(1) : rest;
  const declared = new Set(
    target.options.flatMap((opt) => [opt.long, opt.short].filter((f): f is string => Boolean(f))),
  );
  const problems = tokens
    .filter((token) => token.startsWith("-"))
    .map((token) => token.split("=")[0] ?? token)
    .filter((option) => !declared.has(option))
    .map((option) => `flisk ${target.name()}: unknown option "${option}"`);
  const positionals = tokens.filter((token) => !token.startsWith("-")).length;
  if (positionals > target.registeredArguments.length) {
    problems.push(
      `flisk ${target.name()} takes ${target.registeredArguments.length} positional argument(s), got ${positionals}`,
    );
  }
  return problems;
}

/** Tools whose CLI runs are recorded (arguments, directory and any timeout) and answered with `stdout`. */
function recordingTools(
  stdout: string,
  result: Partial<FliskRun> = {},
): {
  seen: { args: string[]; cwd?: string; timeoutMs?: number }[];
  tools: ReturnType<typeof createFliskTools>;
} {
  const seen: { args: string[]; cwd?: string; timeoutMs?: number }[] = [];
  const tools = createFliskTools(async (args, options) => {
    seen.push({
      args,
      cwd: options?.cwd,
      ...(options?.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    });
    return { exitCode: 0, stdout, stderr: "", ...result };
  });
  return { seen, tools };
}

describe("argument building", () => {
  it("builds up arguments, one --only= per service so a value is never a flag", () => {
    expect(
      buildUpArgs({ stack: "store", only: ["api", "web"], force: true, dryRun: true }),
    ).toEqual(["up", "store", "--only=api", "--only=web", "--force", "--dry-run", "--json"]);
    expect(buildUpArgs({})).toEqual(["up", "--json"]);
  });
  it.each([
    [{ stack: "-rf" }],
    [{ only: ["ok", "--json"] }],
    [{ only: "api" }],
    [{ force: "yes" }],
    [{ stack: "a b" }],
  ])("rejects %j", (args) => {
    expect(() => buildUpArgs(args)).toThrow();
  });
  it("rejects non-string names, non-boolean flags, and non-integer tails", () => {
    expect(() => buildUpArgs({ only: ["api", 7] })).toThrow("only must be an array");
    expect(() => buildUpArgs({ stack: 7 })).toThrow("stack must be a name");
    expect(() => buildUpArgs({ dryRun: "yes" })).toThrow("dryRun must be a boolean");
    expect(() => buildLogsArgs({ tail: "5" })).toThrow("tail must be a positive integer");
    expect(() => buildLogsArgs({ since: 5 })).toThrow("since must be a duration");
  });
  it("builds and validates logs arguments", () => {
    expect(buildLogsArgs({ services: ["api"], tail: 50, since: "5m" })).toEqual([
      "logs",
      "--json",
      "--service=api",
      "--tail=50",
      "--since=5m",
    ]);
    for (const bad of [{ tail: 0 }, { tail: 1.5 }, { since: "5" }, { services: ["-x"] }]) {
      expect(() => buildLogsArgs(bad)).toThrow();
    }
  });

  it("builds resource_create arguments, always non-interactive, with options after the name", () => {
    expect(buildResourceCreateArgs({ name: "api" })).toEqual(["resource", "api", "--yes"]);
    expect(
      buildResourceCreateArgs({
        name: "api",
        type: "backend",
        stack: "shop",
        framework: "hono",
        language: "bun",
        port: 4100,
        features: ["prisma", "drizzle"],
      }),
    ).toEqual([
      "resource",
      "api",
      "--type=backend",
      "--stack=shop",
      "--framework=hono",
      "--language=bun",
      "--port=4100",
      "--feature=prisma",
      "--feature=drizzle",
      "--yes",
    ]);
    expect(
      buildResourceCreateArgs({
        name: "bot",
        type: "agent",
        runtime: "custom",
        durability: "files",
      }),
    ).toEqual([
      "resource",
      "bot",
      "--type=agent",
      "--runtime=custom",
      "--durability=files",
      "--yes",
    ]);
  });
  it.each([
    [{}, "name is required"],
    [{ name: "-rf" }, "name must be a name"],
    [{ name: "a b" }, "name must be a name"],
    [{ name: 7 }, "name must be a name"],
    [{ name: "api", type: "lambda" }, "type must be one of: backend, frontend"],
    [{ name: "api", type: "sdk" }, "type must be one of"],
    [{ name: "api", stack: "--json" }, "stack must be a name"],
    [{ name: "api", framework: "react native" }, "framework must be a name"],
    [{ name: "api", language: "-x" }, "language must be a name"],
    [{ name: "api", port: 0 }, "port must be an integer from 1 to 65535"],
    [{ name: "api", port: 70000 }, "port must be an integer from 1 to 65535"],
    [{ name: "api", port: "4000" }, "port must be an integer from 1 to 65535"],
    [{ name: "api", port: 4000.5 }, "port must be an integer from 1 to 65535"],
    [{ name: "api", features: "prisma" }, "features must be an array of names"],
    [{ name: "api", features: ["--force"] }, "features must be an array of names"],
    [{ name: "bot", runtime: "a/b" }, "runtime must be a name"],
    [{ name: "bot", durability: "" }, "durability must be a name"],
  ])("rejects resource_create arguments %j", (args, message) => {
    expect(() => buildResourceCreateArgs(args)).toThrow(message);
  });

  it("builds stack_assign arguments with one --resources= per name", () => {
    expect(buildStackAssignArgs({ stack: "shop", resources: ["api", "web"] })).toEqual([
      "stack",
      "shop",
      "--resources=api",
      "--resources=web",
      "--yes",
    ]);
  });
  it.each([
    [{ resources: ["api"] }, "stack is required"],
    [{ stack: "shop" }, "resources must name at least one resource"],
    [{ stack: "shop", resources: [] }, "resources must name at least one resource"],
    [{ stack: "-shop", resources: ["api"] }, "stack must be a name"],
    [{ stack: "shop", resources: "api" }, "resources must be an array of names"],
    [{ stack: "shop", resources: ["api", "--list"] }, "resources must be an array of names"],
  ])("rejects stack_assign arguments %j", (args, message) => {
    expect(() => buildStackAssignArgs(args)).toThrow(message);
  });

  it("builds project_init arguments and never passes --force", () => {
    expect(buildProjectInitArgs({})).toEqual(["project", "--yes"]);
    expect(buildProjectInitArgs({ agentSkills: false })).toEqual([
      "project",
      "--no-agent-skills",
      "--yes",
    ]);
    expect(buildProjectInitArgs({ agentSkills: true })).toEqual(["project", "--yes"]);
    expect(buildProjectInitArgs({ template: "agent-stack" })).toEqual([
      "project",
      "agent-stack",
      "--yes",
    ]);
    expect(buildProjectInitArgs({ template: "saas", path: "apps/my saas" })).toEqual([
      "project",
      "saas",
      "--path=apps/my saas",
      "--yes",
    ]);
    for (const template of Object.keys(PROJECT_TEMPLATES)) {
      expect(buildProjectInitArgs({ template })).toEqual(["project", template, "--yes"]);
    }
    expect(JSON.stringify(buildProjectInitArgs({ force: true }))).not.toContain("--force");
  });
  it.each([
    [{ template: "rails" }, "template must be one of: demo"],
    [{ template: "--force" }, "template must be one of"],
    [{ path: "elsewhere" }, "path applies only with a template"],
    [
      { template: "saas", path: "-x" },
      'path must be a non-empty path that does not start with "-"',
    ],
    [{ template: "saas", path: "" }, "path must be a non-empty path"],
    [{ template: "saas", path: "a\nb" }, "path must be a non-empty path"],
    [{ template: "saas", agentSkills: false }, "agentSkills applies only to a blank project"],
    [{ agentSkills: "no" }, "agentSkills must be a boolean"],
  ])("rejects project_init arguments %j", (args, message) => {
    expect(() => buildProjectInitArgs(args)).toThrow(message);
  });

  it("makes config_regenerate a dry run unless dryRun is explicitly false", () => {
    expect(buildConfigRegenerateArgs({})).toEqual(["config", "regenerate", "--dry-run"]);
    expect(buildConfigRegenerateArgs({ dryRun: true })).toEqual([
      "config",
      "regenerate",
      "--dry-run",
    ]);
    expect(buildConfigRegenerateArgs({ dryRun: false })).toEqual(["config", "regenerate"]);
    expect(() => buildConfigRegenerateArgs({ dryRun: "false" })).toThrow(
      "dryRun must be a boolean",
    );
    expect(() => buildConfigRegenerateArgs({ dryRun: 0 })).toThrow("dryRun must be a boolean");
  });
});

describe("cliInvocation", () => {
  it("re-runs a script with its interpreter", () => {
    expect(cliInvocation("/usr/bin/node", "/opt/flisk/bin/flisk.js", () => true)).toEqual([
      "/usr/bin/node",
      "/opt/flisk/bin/flisk.js",
    ]);
  });
  it("runs a compiled binary alone, because its argv[1] is a virtual path", () => {
    expect(cliInvocation("/usr/local/bin/flisk", "/$bunfs/root/flisk", () => false)).toEqual([
      "/usr/local/bin/flisk",
    ]);
    expect(cliInvocation("C:\\flisk.exe", "B:\\~BUN\\root\\flisk.exe", () => false)).toEqual([
      "C:\\flisk.exe",
    ]);
  });
  it("falls back to the executable when there is no script", () => {
    expect(cliInvocation("/usr/local/bin/flisk", "")).toEqual(["/usr/local/bin/flisk"]);
  });
});

function fakeChild() {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn(),
    pid: 123,
  });
}

describe("runFliskCli", () => {
  it("collects output and the exit code", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const pending = runFliskCli(["status", "--json"], { cwd: "/work", timeoutMs: 5000 });
    child.stdout.emit("data", Buffer.from('{"ok":true}'));
    child.stderr.emit("data", Buffer.from("warn"));
    child.emit("close", 0);
    await expect(pending).resolves.toEqual({
      exitCode: 0,
      stdout: '{"ok":true}',
      stderr: "warn",
    });
    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      expect.any(Array),
      expect.objectContaining({ cwd: "/work", stdio: ["ignore", "pipe", "pipe"] }),
    );
  });

  it("rejects when the child cannot start", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const pending = runFliskCli([], {});
    child.emit("error", new Error("spawn failed"));
    await expect(pending).rejects.toThrow("spawn failed");
  });
});

describe("defaultUpDeps", () => {
  it("reads missing logs as empty and names a temp log", async () => {
    expect(defaultUpDeps.readLog(join(tmpdir(), `flisk-missing-${Date.now()}.log`))).toBe("");
    expect(defaultUpDeps.logFile()).toContain("flisk-mcp-up-");
    expect(defaultUpDeps.now()).toBeGreaterThan(0);
    await expect(defaultUpDeps.sleep(0)).resolves.toBeUndefined();
  });

  it("starts the CLI detached with the log file as stdio", () => {
    const child = { pid: 9, unref: vi.fn() };
    spawnMock.mockReturnValue(child);
    const log = join(tmpdir(), `flisk-mcp-up-test-${Date.now()}.log`);
    try {
      expect(defaultUpDeps.spawnUp(["up", "--json"], log, "/work")).toBe(child);
      expect(spawnMock).toHaveBeenCalledWith(
        process.execPath,
        expect.any(Array),
        expect.objectContaining({ cwd: "/work", detached: true }),
      );
    } finally {
      rmSync(log, { force: true });
    }
  });
});

describe("toToolResult", () => {
  const run = (stdout: string, exitCode = 0) => ({ exitCode, stdout, stderr: "boom" });
  it("passes a clean envelope through as a success", () => {
    const r = toToolResult(run('{"schemaVersion":1,"data":{"ready":false},"errors":[]}\n', 1));
    expect(r.isError).toBe(false);
  });
  it("marks an envelope with errors or ok:false as an error", () => {
    expect(
      toToolResult(run('{"schemaVersion":1,"data":null,"errors":[{"code":"X","message":"m"}]}'))
        .isError,
    ).toBe(true);
    expect(toToolResult(run('{"schemaVersion":1,"data":{"ok":false},"errors":[]}')).isError).toBe(
      true,
    );
  });
  it("uses the last JSON line and reports missing JSON with stderr", () => {
    expect(toToolResult(run('noise\n{"schemaVersion":1,"data":{"a":1},"errors":[]}')).isError).toBe(
      false,
    );
    const none = toToolResult(run("", 2));
    expect(none.isError).toBe(true);
    expect(JSON.stringify(none.data)).toContain("boom");
  });
  it("reports BAD_JSON and the exit code when there is no parseable envelope", () => {
    const bad = toToolResult(run("prefix\n{not json", 0));
    expect(bad.isError).toBe(true);
    expect(JSON.stringify(bad.data)).toContain("BAD_JSON");
    const empty = toToolResult({ exitCode: 3, stdout: "", stderr: "" });
    expect(empty.isError).toBe(true);
    expect(JSON.stringify(empty.data)).toContain("flisk exited with code 3");
  });
  it("reads a pretty-printed envelope (projects, networks) after incidental output", () => {
    const envelope = {
      schemaVersion: 1,
      data: { services: [{ name: "api", status: "stopped" }, {}] },
      errors: [],
    };
    const r = toToolResult(run(`warning: slow\n${JSON.stringify(envelope, null, 2)}\n`));
    expect(r).toEqual({ data: envelope, isError: false });
    const failed = { schemaVersion: 1, data: null, errors: [{ code: "NOT_IN_PROJECT" }] };
    expect(toToolResult(run(JSON.stringify(failed, null, 2), 1))).toEqual({
      data: failed,
      isError: true,
    });
  });
  it("marks a top-level ok:false (runtime --check-assets --json) as an error", () => {
    const r = toToolResult(run('{"ok":false,"assetRoot":null,"missing":["engine"]}', 1));
    expect(r).toEqual({ data: { ok: false, assetRoot: null, missing: ["engine"] }, isError: true });
    expect(toToolResult(run('{"ok":true,"missing":[]}')).isError).toBe(false);
  });
});

describe("toTextResult", () => {
  it("returns the text output, with stderr only when there is some", () => {
    expect(toTextResult({ exitCode: 0, stdout: "  created\n", stderr: "" })).toEqual({
      data: { exitCode: 0, output: "created" },
      isError: false,
    });
  });
  it("is an error result on a non-zero or missing exit code", () => {
    expect(toTextResult({ exitCode: 1, stdout: "", stderr: "❌ Directory exists\n" })).toEqual({
      data: { exitCode: 1, output: "", stderr: "❌ Directory exists" },
      isError: true,
    });
    expect(toTextResult({ exitCode: null, stdout: "partial", stderr: "" }).isError).toBe(true);
  });
});

function fakeUp(options: { logs: string[]; exitAfter?: { atRead: number; code: number } }): {
  deps: UpDeps;
  child: EventEmitter & { pid: number; unref: () => void };
} {
  const child = Object.assign(new EventEmitter(), { pid: 4242, unref: vi.fn() });
  let reads = 0;
  let clock = 0;
  const deps: UpDeps = {
    spawnUp: vi.fn(() => child as never),
    readLog: () => {
      const text = options.logs[Math.min(reads, options.logs.length - 1)] ?? "";
      reads += 1;
      if (options.exitAfter && reads === options.exitAfter.atRead)
        child.emit("exit", options.exitAfter.code);
      return text;
    },
    sleep: async () => {
      clock += 1000;
    },
    now: () => clock,
    logFile: () => "/tmp/x.log",
  };
  return { deps, child };
}

describe("startUp", () => {
  it("returns an early refusal from the child", async () => {
    const line =
      '{"schemaVersion":1,"data":{"ok":false},"errors":[{"code":"UNKNOWN_SERVICE","message":"nope"}]}';
    const { deps } = fakeUp({ logs: ["", line] });
    const r = await startUp({ only: ["nope"] }, deps);
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.data)).toContain("UNKNOWN_SERVICE");
  });
  it("returns started + a polling hint, and detaches, when nothing happens within the window", async () => {
    const { deps, child } = fakeUp({ logs: [""] });
    const r = await startUp({ waitSeconds: 3 }, deps);
    expect(r.isError).toBe(false);
    expect(r.data).toMatchObject({ data: { started: true, pid: 4242, logFile: "/tmp/x.log" } });
    expect(child.unref).toHaveBeenCalled();
  });
  it("reports a child that exits without a result, with the log tail", async () => {
    const { deps } = fakeUp({ logs: ["", "Error: it broke"], exitAfter: { atRead: 2, code: 1 } });
    const r = await startUp({}, deps);
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.data)).toContain("it broke");
  });
  it("returns a ready result immediately when the child already printed one", async () => {
    const line = '{"schemaVersion":1,"data":{"ok":true,"services":["api"]},"errors":[]}';
    const { deps } = fakeUp({ logs: [line] });
    expect((await startUp({}, deps)).isError).toBe(false);
  });
  it("starts from an explicitly supplied project directory", async () => {
    const { deps } = fakeUp({ logs: ['{"schemaVersion":1,"data":{"ok":true},"errors":[]}'] });
    await startUp({ projectPath: "/work/erp" }, deps);
    expect(deps.spawnUp).toHaveBeenCalledWith(["up", "--json"], "/tmp/x.log", "/work/erp");
  });
  it("rejects a relative project path and clamps a negative wait window", async () => {
    const relative = fakeUp({ logs: [""] });
    await expect(startUp({ projectPath: "relative" }, relative.deps)).rejects.toThrow(
      "projectPath must be an absolute path",
    );

    const negative = fakeUp({ logs: [""] });
    const result = await startUp({ waitSeconds: -5 }, negative.deps);
    expect(result.isError).toBe(false);
    expect(JSON.stringify(result.data)).toContain('"started":true');
  });
});

describe("tool list", () => {
  it("exposes tools with object schemas and no streaming logs", () => {
    const tools = createFliskTools(async () => ({ exitCode: 0, stdout: "", stderr: "" }));
    expect(tools.map((t) => t.name)).toEqual([
      "doctor",
      "up",
      "down",
      "status",
      "logs",
      "resource_list",
      "resource_restart",
      "agent_list",
      "agent_sessions",
      "stack_list",
      "project_info",
      "network_list",
      "config_verify",
      "config_explain",
      "runtime_check",
      "config_regenerate",
      "resource_create",
      "stack_assign",
      "project_init",
      "project_eject",
      "project_import",
    ]);
    for (const t of tools)
      expect(t.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
    for (const t of tools) expect(t.inputSchema.properties).toHaveProperty("projectPath");
    expect(JSON.stringify(tools.find((t) => t.name === "logs")?.inputSchema)).not.toContain(
      "follow",
    );
  });
  it("routes a tool to its command and project directory", async () => {
    const seen: { args: string[]; cwd?: string }[] = [];
    const tools = createFliskTools(async (args, options) => {
      seen.push({ args, cwd: options?.cwd });
      return { exitCode: 0, stdout: '{"schemaVersion":1,"data":[],"errors":[]}', stderr: "" };
    });
    await tools.find((t) => t.name === "doctor")?.handler({ projectPath: "/work/erp" });
    await tools.find((t) => t.name === "resource_list")?.handler({ stack: "store" });
    await tools.find((t) => t.name === "status")?.handler({});
    await tools.find((t) => t.name === "down")?.handler({ dryRun: true });
    await tools.find((t) => t.name === "resource_restart")?.handler({ resource: "api" });
    await tools.find((t) => t.name === "agent_list")?.handler({ stack: "shop" });
    await tools
      .find((t) => t.name === "agent_sessions")
      ?.handler({ resource: "bot", sessionId: "sess-1" });
    await tools.find((t) => t.name === "agent_sessions")?.handler({ resource: "bot" });
    expect(seen).toEqual([
      { args: ["doctor", "--json"], cwd: "/work/erp" },
      { args: ["resources", "--json", "--stack=store"], cwd: undefined },
      { args: ["status", "--json"], cwd: undefined },
      { args: ["down", "--json", "--dry-run"], cwd: undefined },
      { args: ["restart", "api", "--json"], cwd: undefined },
      { args: ["resources", "--type=agent", "--json", "--stack=shop"], cwd: undefined },
      { args: ["agent", "sessions", "bot", "--session-id=sess-1", "--json"], cwd: undefined },
      { args: ["agent", "sessions", "bot", "--json"], cwd: undefined },
    ]);
    await expect(
      tools.find((t) => t.name === "doctor")?.handler({ projectPath: "relative" }),
    ).rejects.toThrow("projectPath must be an absolute path");
    await expect(tools.find((t) => t.name === "resource_restart")?.handler({})).rejects.toThrow(
      "resource is required",
    );
    await expect(tools.find((t) => t.name === "agent_sessions")?.handler({})).rejects.toThrow(
      "resource is required",
    );
    expect(tools.find((t) => t.name === "agent_sessions")?.inputSchema).toMatchObject({
      required: ["resource"],
    });
  });
  it("rejects invalid tool arguments before running the CLI", async () => {
    const tools = createFliskTools(async () => ({ exitCode: 0, stdout: "", stderr: "" }));
    await expect(
      tools.find((t) => t.name === "resource_restart")?.handler({ resource: "-x" }),
    ).rejects.toThrow("resource must be a name");
    await expect(
      tools.find((t) => t.name === "agent_list")?.handler({ stack: "a b" }),
    ).rejects.toThrow("stack must be a name");
    await expect(
      tools.find((t) => t.name === "doctor")?.handler({ noPing: "yes" }),
    ).rejects.toThrow("noPing must be a boolean");
    await expect(
      tools.find((t) => t.name === "status")?.handler({ projectPath: 42 }),
    ).rejects.toThrow("projectPath must be an absolute path");
  });

  it("runs the up handler through the injected dependencies", async () => {
    const { deps } = fakeUp({ logs: ['{"schemaVersion":1,"data":{"ok":true},"errors":[]}'] });
    const tools = createFliskTools(async () => ({ exitCode: 0, stdout: "", stderr: "" }), deps);
    const result = await tools.find((t) => t.name === "up")?.handler({ waitSeconds: 0 });
    expect(result?.isError).toBe(false);
  });

  it("routes the read-only tools to their --json commands and project directory", async () => {
    const { seen, tools } = recordingTools('{"schemaVersion":1,"data":{},"errors":[]}');
    const call = (name: string, args: Record<string, unknown>) =>
      tools.find((t) => t.name === name)?.handler(args);
    await call("stack_list", { projectPath: "/work/erp" });
    await call("stack_list", { services: true, verbose: true });
    await call("project_info", {});
    await call("network_list", { stack: "shop" });
    await call("network_list", {});
    await call("config_verify", { projectPath: "/work/erp" });
    await call("config_explain", { file: ".flisk/.flisk-out/Tiltfile" });
    await call("config_explain", { file: "/work/erp/services/shop/api/service.json" });
    await call("runtime_check", {});
    expect(seen).toEqual([
      { args: ["stacks", "--json"], cwd: "/work/erp" },
      { args: ["stacks", "--json", "--services", "--verbose"], cwd: undefined },
      { args: ["projects", "--json"], cwd: undefined },
      { args: ["networks", "--json", "--stack=shop"], cwd: undefined },
      { args: ["networks", "--json"], cwd: undefined },
      { args: ["config", "verify", "--json"], cwd: "/work/erp" },
      { args: ["config", "explain", ".flisk/.flisk-out/Tiltfile", "--json"], cwd: undefined },
      {
        args: ["config", "explain", "/work/erp/services/shop/api/service.json", "--json"],
        cwd: undefined,
      },
      { args: ["runtime", "--check-assets", "--json"], cwd: undefined },
    ]);
    expect(tools.find((t) => t.name === "config_explain")?.inputSchema).toMatchObject({
      required: ["file"],
    });
  });

  it("rejects invalid read-only tool arguments before running the CLI", async () => {
    const { seen, tools } = recordingTools("");
    const call = (name: string, args: Record<string, unknown>) =>
      tools.find((t) => t.name === name)?.handler(args);
    await expect(call("stack_list", { services: "yes" })).rejects.toThrow(
      "services must be a boolean",
    );
    await expect(call("stack_list", { verbose: 1 })).rejects.toThrow("verbose must be a boolean");
    await expect(call("network_list", { stack: "-s" })).rejects.toThrow("stack must be a name");
    await expect(call("config_explain", {})).rejects.toThrow("file is required");
    await expect(call("config_explain", { file: "--json" })).rejects.toThrow(
      'file must be a non-empty path that does not start with "-"',
    );
    await expect(call("config_explain", { file: 42 })).rejects.toThrow("file must be a non-empty");
    await expect(call("project_info", { projectPath: "relative" })).rejects.toThrow(
      "projectPath must be an absolute path",
    );
    expect(seen).toEqual([]);
  });

  it("runs the scaffolding tools non-interactively and returns their text output", async () => {
    const { seen, tools } = recordingTools("✅ Resource created successfully!\n");
    const call = (name: string, args: Record<string, unknown>) =>
      tools.find((t) => t.name === name)?.handler(args);
    const created = await call("resource_create", {
      projectPath: "/work/erp",
      name: "api",
      type: "backend",
      stack: "shop",
    });
    expect(created).toEqual({
      data: { exitCode: 0, output: "✅ Resource created successfully!" },
      isError: false,
    });
    await call("stack_assign", { stack: "shop", resources: ["api"] });
    await call("project_init", { projectPath: "/work/new-app" });
    await call("project_init", { template: "agent-stack" });
    await call("config_regenerate", {});
    await call("config_regenerate", { dryRun: false });
    expect(seen).toEqual([
      {
        args: ["resource", "api", "--type=backend", "--stack=shop", "--yes"],
        cwd: "/work/erp",
      },
      { args: ["stack", "shop", "--resources=api", "--yes"], cwd: undefined },
      { args: ["project", "--yes"], cwd: "/work/new-app", timeoutMs: 300_000 },
      { args: ["project", "agent-stack", "--yes"], cwd: undefined, timeoutMs: 300_000 },
      { args: ["config", "regenerate", "--dry-run"], cwd: undefined },
      { args: ["config", "regenerate"], cwd: undefined },
    ]);
    expect(tools.find((t) => t.name === "resource_create")?.inputSchema).toMatchObject({
      required: ["name"],
      properties: { type: { enum: [...CREATABLE_RESOURCE_TYPES] } },
    });
    expect(tools.find((t) => t.name === "stack_assign")?.inputSchema).toMatchObject({
      required: ["stack", "resources"],
    });
    expect(tools.find((t) => t.name === "project_init")?.inputSchema).toMatchObject({
      properties: { template: { enum: Object.keys(PROJECT_TEMPLATES) } },
    });
    expect(JSON.stringify(tools.find((t) => t.name === "project_init")?.inputSchema)).not.toContain(
      "force",
    );
  });

  it("returns a failed scaffold as an error result with its stderr", async () => {
    const { tools } = recordingTools("", { exitCode: 1, stderr: "❌ Directory already exists" });
    const result = await tools
      .find((t) => t.name === "resource_create")
      ?.handler({ name: "api", stack: "shop" });
    expect(result).toEqual({
      data: { exitCode: 1, output: "", stderr: "❌ Directory already exists" },
      isError: true,
    });
  });

  it("rejects invalid scaffolding arguments before running the CLI", async () => {
    const { seen, tools } = recordingTools("");
    const call = (name: string, args: Record<string, unknown>) =>
      tools.find((t) => t.name === name)?.handler(args);
    await expect(call("resource_create", {})).rejects.toThrow("name is required");
    await expect(call("resource_create", { name: "api", type: "lambda" })).rejects.toThrow(
      "type must be one of",
    );
    await expect(call("stack_assign", { stack: "shop", resources: [] })).rejects.toThrow(
      "resources must name at least one resource",
    );
    await expect(call("project_init", { template: "nope" })).rejects.toThrow(
      "template must be one of",
    );
    await expect(call("project_init", { projectPath: "new-app" })).rejects.toThrow(
      "projectPath must be an absolute path",
    );
    await expect(call("config_regenerate", { dryRun: "no" })).rejects.toThrow(
      "dryRun must be a boolean",
    );
    expect(seen).toEqual([]);
  });

  it("says what to try next when it rejects a new tool's argument", async () => {
    const { tools } = recordingTools("");
    const call = (name: string, args: Record<string, unknown>) =>
      tools.find((t) => t.name === name)?.handler(args);
    const rejected: [string, Record<string, unknown>][] = [
      ["resource_create", {}],
      ["resource_create", { name: "api", type: "lambda" }],
      ["resource_create", { name: "api", port: 0 }],
      ["stack_assign", { resources: ["api"] }],
      ["stack_assign", { stack: "shop", resources: [] }],
      ["project_init", { path: "elsewhere" }],
      ["project_init", { template: "saas", agentSkills: false }],
      ["config_explain", {}],
      ["config_explain", { file: "-x" }],
      ["project_eject", {}],
      ["project_eject", { confirm: "yes" }],
      ["project_import", { dir: "-x" }],
      ["project_import", { force: 1 }],
    ];
    for (const [name, args] of rejected) {
      const error = await Promise.resolve(call(name, args)).catch((e: unknown) => e);
      expect(error, `${name} ${JSON.stringify(args)}`).toBeInstanceOf(FliskError);
      expect((error as FliskError).suggestions.length).toBeGreaterThan(0);
    }
  });

  it("says what to try next when it rejects any tool's argument, with the message unchanged", async () => {
    const { seen, tools } = recordingTools("");
    const call = (name: string, args: Record<string, unknown>) =>
      tools.find((t) => t.name === name)?.handler(args);
    const rejected: [string, Record<string, unknown>, string][] = [
      ["resource_restart", {}, "resource is required"],
      ["resource_restart", { resource: "-x" }, "resource must be a name"],
      ["agent_sessions", {}, "resource is required"],
      ["agent_list", { stack: "a b" }, "stack must be a name"],
      ["logs", { services: ["ok", "-bad"] }, "services must be an array of names"],
      ["logs", { tail: 0 }, "tail must be a positive integer"],
      ["logs", { since: "soon" }, "since must be a duration such as 30s, 5m or 1h"],
      ["doctor", { noPing: "yes" }, "noPing must be a boolean"],
      ["status", { projectPath: "relative" }, "projectPath must be an absolute path"],
      ["up", { only: ["-x"] }, "only must be an array of names"],
    ];
    for (const [name, args, message] of rejected) {
      const error = await Promise.resolve(call(name, args)).catch((e: unknown) => e);
      expect(error, `${name} ${JSON.stringify(args)}`).toBeInstanceOf(FliskError);
      expect((error as FliskError).message).toContain(message);
      expect((error as FliskError).suggestions.length).toBeGreaterThan(0);
    }
    expect(seen).toEqual([]);
  });

  it("refuses project_eject without confirm, and runs it with confirm or as a dry run", async () => {
    const { seen, tools } = recordingTools(
      '{"schemaVersion":1,"data":{"created":true},"errors":[]}',
    );
    const eject = tools.find((t) => t.name === "project_eject");
    await expect(eject?.handler({})).rejects.toThrow("it needs confirm: true");
    await expect(eject?.handler({ confirm: false })).rejects.toThrow("it needs confirm: true");
    expect(seen).toEqual([]);

    const result = await eject?.handler({ projectPath: "/work/erp", confirm: true });
    expect(result).toEqual({
      data: { schemaVersion: 1, data: { created: true }, errors: [] },
      isError: false,
    });
    await eject?.handler({ dryRun: true });
    expect(seen).toEqual([
      { args: ["eject", "--yes", "--json"], cwd: "/work/erp" },
      { args: ["eject", "--dry-run", "--json"], cwd: undefined },
    ]);
    expect(buildProjectEjectArgs({ confirm: true, dryRun: true })).toEqual([
      "eject",
      "--dry-run",
      "--json",
    ]);
    expect(eject?.inputSchema).toMatchObject({
      properties: { confirm: { type: "boolean" }, dryRun: { type: "boolean" } },
    });
  });

  it("runs project_import through flisk import --json with the directory before its flags", async () => {
    const { seen, tools } = recordingTools(
      '{"schemaVersion":1,"data":{"written":["services/legacy/api/service.json"]},"errors":[]}',
    );
    const call = (args: Record<string, unknown>) =>
      tools.find((t) => t.name === "project_import")?.handler(args);
    const result = await call({ projectPath: "/work/erp", dir: "legacy" });
    expect(result?.isError).toBe(false);
    await call({ dryRun: true });
    await call({ dir: "/srv/legacy", dryRun: true, force: true });
    expect(seen).toEqual([
      { args: ["import", "legacy", "--json"], cwd: "/work/erp", timeoutMs: 300_000 },
      { args: ["import", "--dry-run", "--json"], cwd: undefined, timeoutMs: 300_000 },
      {
        args: ["import", "/srv/legacy", "--dry-run", "--force", "--json"],
        cwd: undefined,
        timeoutMs: 300_000,
      },
    ]);
    expect(buildProjectImportArgs({})).toEqual(["import", "--json"]);
  });

  it("reports a failed import envelope as an error result", async () => {
    const { tools } = recordingTools(
      '{"schemaVersion":1,"data":null,"errors":[{"code":"IMPORT_FAILED","message":"Nothing to import"}]}',
      { exitCode: 1 },
    );
    const result = await tools.find((t) => t.name === "project_import")?.handler({});
    expect(result?.isError).toBe(true);
  });

  it("keeps the old verb-first names callable without listing them", () => {
    const tools = createFliskTools(async () => ({ exitCode: 0, stdout: "", stderr: "" }));
    const aliases = Object.fromEntries(
      tools.flatMap((t) => (t.aliases ?? []).map((alias) => [alias, t.name])),
    );
    expect(aliases).toEqual({
      restart_resource: "resource_restart",
      list_agents: "agent_list",
      get_agent_sessions: "agent_sessions",
    });
    const names = tools.map((t) => t.name);
    for (const alias of Object.keys(aliases)) expect(names).not.toContain(alias);
  });

  it("passes only arguments and options that the target CLI command declares", async () => {
    const commands = loadRegisteredCommandMap();
    const { seen, tools } = recordingTools('{"schemaVersion":1,"data":{},"errors":[]}');
    // Every tool that runs the CLI directly, with every option it can pass.
    const calls: Record<string, Record<string, unknown>> = {
      doctor: { noPing: true },
      down: { dryRun: true },
      status: {},
      logs: { services: ["api"], tail: 5, since: "5m" },
      resource_list: { stack: "shop" },
      resource_restart: { resource: "api" },
      agent_list: { stack: "shop" },
      agent_sessions: { resource: "bot", sessionId: "s1" },
      stack_list: { services: true, verbose: true },
      project_info: {},
      network_list: { stack: "shop" },
      config_verify: {},
      config_explain: { file: "service.json" },
      runtime_check: {},
      config_regenerate: { dryRun: true },
      resource_create: {
        name: "bot",
        type: "agent",
        stack: "shop",
        framework: "hono",
        language: "bun",
        port: 4800,
        features: ["prisma"],
        runtime: "custom",
        durability: "files",
      },
      stack_assign: { stack: "shop", resources: ["api", "web"] },
      project_init: { agentSkills: false },
      project_eject: { confirm: true },
      project_import: { dir: "legacy", dryRun: true, force: true },
    };
    expect(Object.keys(calls).sort()).toEqual(
      tools
        .map((t) => t.name)
        .filter((name) => name !== "up")
        .sort(),
    );
    for (const [name, args] of Object.entries(calls)) {
      await tools.find((t) => t.name === name)?.handler(args);
    }
    await tools.find((t) => t.name === "project_init")?.handler({ template: "saas", path: "app" });
    await tools.find((t) => t.name === "project_eject")?.handler({ dryRun: true });
    expect(seen).toHaveLength(Object.keys(calls).length + 2);
    for (const { args } of seen) expect(undeclaredArguments(args, commands)).toEqual([]);
    expect(
      undeclaredArguments(
        buildUpArgs({ stack: "shop", only: ["api"], force: true, dryRun: true }),
        commands,
      ),
    ).toEqual([]);

    // The check itself catches an unknown option and a surplus positional argument.
    expect(undeclaredArguments(["stacks", "--bogus"], commands)).toEqual([
      'flisk stacks: unknown option "--bogus"',
    ]);
    expect(undeclaredArguments(["config", "verify", "extra"], commands)).toEqual([
      "flisk verify takes 0 positional argument(s), got 1",
    ]);
  });

  it("keeps docs/agents/llms.txt and docs/agents/llms-full.txt in sync with MCP tools and CLI commands", async () => {
    const toolsSource = readFileSync(resolve(testDir, "../tools.ts"), "utf-8");
    const sourceToolNames = [...toolsSource.matchAll(/^\s*name:\s*"([^"]+)"/gm)].map((m) => m[1]);
    const runtimeToolNames = createFliskTools(async () => ({
      exitCode: 0,
      stdout: "",
      stderr: "",
    })).map((t) => t.name);
    expect(sourceToolNames).toEqual(runtimeToolNames);

    const commands = loadRegisteredCommandMap();
    expect(commands.size).toBeGreaterThan(10);

    for (const relPath of ["docs/agents/llms.txt", "docs/agents/llms-full.txt"]) {
      const content = readFileSync(resolve(repoRoot, relPath), "utf-8");
      for (const toolName of sourceToolNames) {
        expect(
          content,
          `${relPath} must document MCP tool "${toolName}" with a one-line description`,
        ).toMatch(new RegExp(`^\\s*-\\s*\`${toolName}\`:\\s+\\S+`, "m"));
      }
      expect(checkDocCliInvocations(content, commands), `CLI command drift in ${relPath}`).toEqual(
        [],
      );
    }

    // Verify the checker rejects `flisk down [stack]` and unknown flags
    expect(checkDocCliInvocations("- `flisk down [stack] [--json]`", commands)).toEqual([
      'flisk down takes 0 positional argument(s), but doc has 1 in "`flisk down [stack] [--json]`"',
    ]);
    expect(checkDocCliInvocations("- `flisk down [--bogus]`", commands)).toEqual([
      'flisk down: unknown flag "--bogus" in "`flisk down [--bogus]`"',
    ]);
  });
});
