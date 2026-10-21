// Copyright (c) 2026 TDK Landscape contributors
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
import {
  buildLogsArgs,
  buildUpArgs,
  cliInvocation,
  createTdkTools,
  defaultUpDeps,
  runTdkCli,
  startUp,
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

/** Validate `tdk <subcommand> ...` usage snippets against registered Commander commands. */
function checkDocCliInvocations(docText: string, commands: Map<string, Command>): string[] {
  const problems: string[] = [];
  const matches = [
    ...docText.matchAll(/`tdk\s+([a-z][\w-]*)(?:\s+([^`\n]*))?`/g),
    ...docText.matchAll(/^\s*tdk\s+([a-z][\w-]*)(?:\s+([^\n]*))?$/gm),
  ];
  for (const match of matches) {
    const subName = match[1];
    const rest = (match[2] ?? "").trim();
    const rootCmd = commands.get(subName);
    if (!rootCmd) {
      problems.push(`unknown command "tdk ${subName}"`);
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
          problems.push(`tdk ${targetCmd.name()}: unknown flag "${flagName}" in "${match[0]}"`);
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
        `tdk ${targetCmd.name()} takes ${targetCmd.registeredArguments.length} positional argument(s), but doc has ${positionalCount} in "${match[0]}"`,
      );
    }
  }
  return problems;
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
});

describe("cliInvocation", () => {
  it("re-runs a script with its interpreter", () => {
    expect(cliInvocation("/usr/bin/node", "/opt/tdk/bin/flisk.js", () => true)).toEqual([
      "/usr/bin/node",
      "/opt/tdk/bin/flisk.js",
    ]);
  });
  it("runs a compiled binary alone, because its argv[1] is a virtual path", () => {
    expect(cliInvocation("/usr/local/bin/tdk", "/$bunfs/root/tdk", () => false)).toEqual([
      "/usr/local/bin/tdk",
    ]);
    expect(cliInvocation("C:\\tdk.exe", "B:\\~BUN\\root\\tdk.exe", () => false)).toEqual([
      "C:\\tdk.exe",
    ]);
  });
  it("falls back to the executable when there is no script", () => {
    expect(cliInvocation("/usr/local/bin/tdk", "")).toEqual(["/usr/local/bin/tdk"]);
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

describe("runTdkCli", () => {
  it("collects output and the exit code", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const pending = runTdkCli(["status", "--json"], { cwd: "/work", timeoutMs: 5000 });
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
    const pending = runTdkCli([], {});
    child.emit("error", new Error("spawn failed"));
    await expect(pending).rejects.toThrow("spawn failed");
  });
});

describe("defaultUpDeps", () => {
  it("reads missing logs as empty and names a temp log", async () => {
    expect(defaultUpDeps.readLog(join(tmpdir(), `tdk-missing-${Date.now()}.log`))).toBe("");
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
    expect(JSON.stringify(empty.data)).toContain("tdk exited with code 3");
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
    const tools = createTdkTools(async () => ({ exitCode: 0, stdout: "", stderr: "" }));
    expect(tools.map((t) => t.name)).toEqual([
      "doctor",
      "up",
      "down",
      "status",
      "logs",
      "resource_list",
      "restart_resource",
      "list_agents",
      "get_agent_sessions",
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
    const tools = createTdkTools(async (args, options) => {
      seen.push({ args, cwd: options?.cwd });
      return { exitCode: 0, stdout: '{"schemaVersion":1,"data":[],"errors":[]}', stderr: "" };
    });
    await tools.find((t) => t.name === "doctor")?.handler({ projectPath: "/work/erp" });
    await tools.find((t) => t.name === "resource_list")?.handler({ stack: "store" });
    await tools.find((t) => t.name === "status")?.handler({});
    await tools.find((t) => t.name === "down")?.handler({ dryRun: true });
    await tools.find((t) => t.name === "restart_resource")?.handler({ resource: "api" });
    await tools.find((t) => t.name === "list_agents")?.handler({ stack: "shop" });
    await tools
      .find((t) => t.name === "get_agent_sessions")
      ?.handler({ resource: "bot", sessionId: "sess-1" });
    expect(seen).toEqual([
      { args: ["doctor", "--json"], cwd: "/work/erp" },
      { args: ["resources", "--json", "--stack=store"], cwd: undefined },
      { args: ["status", "--json"], cwd: undefined },
      { args: ["down", "--json", "--dry-run"], cwd: undefined },
      { args: ["restart", "api", "--json"], cwd: undefined },
      { args: ["resources", "--type=agent", "--json", "--stack=shop"], cwd: undefined },
      { args: ["agent", "sessions", "bot", "--session-id=sess-1", "--json"], cwd: undefined },
    ]);
    await expect(
      tools.find((t) => t.name === "doctor")?.handler({ projectPath: "relative" }),
    ).rejects.toThrow("projectPath must be an absolute path");
    await expect(tools.find((t) => t.name === "restart_resource")?.handler({})).rejects.toThrow(
      "resource is required",
    );
    await expect(tools.find((t) => t.name === "get_agent_sessions")?.handler({})).rejects.toThrow(
      "resource is required",
    );
    await expect(
      tools.find((t) => t.name === "get_agent_sessions")?.handler({ resource: "bot" }),
    ).rejects.toThrow("sessionId is required");
    expect(tools.find((t) => t.name === "get_agent_sessions")?.inputSchema).toMatchObject({
      required: ["resource", "sessionId"],
    });
  });
  it("rejects invalid tool arguments before running the CLI", async () => {
    const tools = createTdkTools(async () => ({ exitCode: 0, stdout: "", stderr: "" }));
    await expect(
      tools.find((t) => t.name === "restart_resource")?.handler({ resource: "-x" }),
    ).rejects.toThrow("resource must be a name");
    await expect(
      tools.find((t) => t.name === "list_agents")?.handler({ stack: "a b" }),
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
    const tools = createTdkTools(async () => ({ exitCode: 0, stdout: "", stderr: "" }), deps);
    const result = await tools.find((t) => t.name === "up")?.handler({ waitSeconds: 0 });
    expect(result?.isError).toBe(false);
  });

  it("keeps docs/agents/llms.txt and docs/agents/llms-full.txt in sync with MCP tools and CLI commands", async () => {
    const toolsSource = readFileSync(resolve(testDir, "../tools.ts"), "utf-8");
    const sourceToolNames = [...toolsSource.matchAll(/^\s*name:\s*"([^"]+)"/gm)].map((m) => m[1]);
    const runtimeToolNames = createTdkTools(async () => ({
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

    // Verify the checker rejects `tdk down [stack]` and unknown flags
    expect(checkDocCliInvocations("- `tdk down [stack] [--json]`", commands)).toEqual([
      'tdk down takes 0 positional argument(s), but doc has 1 in "`tdk down [stack] [--json]`"',
    ]);
    expect(checkDocCliInvocations("- `tdk down [--bogus]`", commands)).toEqual([
      'tdk down: unknown flag "--bogus" in "`tdk down [--bogus]`"',
    ]);
  });
});
