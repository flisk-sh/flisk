// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
/// <reference types="vite/client" />

import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import {
  buildLogsArgs,
  buildUpArgs,
  cliInvocation,
  createTdkTools,
  startUp,
  toToolResult,
  type UpDeps,
} from "../tools.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../../../..");
const commandModules = import.meta.glob<Record<string, Command>>("../../commands/*.{ts,tsx}");

async function loadRegisteredCommandMap(): Promise<Map<string, Command>> {
  const cliSource = readFileSync(resolve(testDir, "../../cli.ts"), "utf-8");
  const imports = [
    ...cliSource.matchAll(/import \{ (\w+Command) \} from "\.\/commands\/([\w-]+)\.js"/g),
  ];
  const byName = new Map<string, Command>();
  for (const [, exportName, file] of imports) {
    const load =
      commandModules[`../../commands/${file}.ts`] ?? commandModules[`../../commands/${file}.tsx`];
    if (!load) continue;
    const mod = await load();
    const cmd = mod[exportName];
    if (cmd) {
      byName.set(cmd.name(), cmd);
      for (const alias of cmd.aliases()) byName.set(alias, cmd);
    }
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
    expect(cliInvocation("/usr/bin/node", "/opt/tdk/bin/tdk.js", () => true)).toEqual([
      "/usr/bin/node",
      "/opt/tdk/bin/tdk.js",
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

  it("keeps docs/agents/llms.txt and docs/agents/llms-full.txt in sync with MCP tools and CLI commands", async () => {
    const toolsSource = readFileSync(resolve(testDir, "../tools.ts"), "utf-8");
    const sourceToolNames = [...toolsSource.matchAll(/^\s*name:\s*"([^"]+)"/gm)].map((m) => m[1]);
    const runtimeToolNames = createTdkTools(async () => ({
      exitCode: 0,
      stdout: "",
      stderr: "",
    })).map((t) => t.name);
    expect(sourceToolNames).toEqual(runtimeToolNames);

    const commands = await loadRegisteredCommandMap();
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
