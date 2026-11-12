// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

/**
 * `flisk tool add <tool> [name]`: add a tool by the name people know it by (React, PostgreSQL, FastAPI, RAG).
 *
 * The tool list and what each one does live in utils/tool-catalog.ts. A tool Flisk can generate runs the real
 * `flisk resource` command; a built-in tool says so; a tool Flisk cannot generate prints the steps to run it under Flisk;
 * a cloud provider is rejected with exit 1, because Flisk runs the stack on your own computer.
 */

import { spawnSync } from "node:child_process";
import chalk from "chalk";
import { Command } from "commander";
import { type CliInvocation, cliInvocation } from "../utils/cli-invocation.js";
import { addYesOption } from "../utils/command-helpers.js";
import { FliskError, runCommand } from "../utils/errors.js";
import { runJsonCommand } from "../utils/json-command.js";
import {
  findTool,
  resourceArgs,
  TOOL_CATALOG,
  type ToolEntry,
  type ToolGroup,
  toolIds,
} from "../utils/tool-catalog.js";

export interface AddOptions {
  stack?: string;
  dryRun?: boolean;
  json?: boolean;
  yes?: boolean;
}

const GROUP_TITLES: Record<ToolGroup, string> = {
  frontend: "Frontend",
  backend: "Backend",
  data: "Data",
  ai: "AI",
  devops: "DevOps",
  guidewire: "Guidewire",
  cloud: "Not added (cloud and clusters)",
};

const STATUS_LABEL: Record<ToolEntry["status"], string> = {
  resource: "adds a resource",
  "built-in": "built in",
  manual: "manual steps",
  rejected: "rejected",
};

/** The catalog as lines, grouped, for `flisk tool add` with no tool. */
export function formatToolList(): string[] {
  const lines: string[] = ["Tools you can add with flisk tool add <tool> [name]:", ""];
  for (const group of Object.keys(GROUP_TITLES) as ToolGroup[]) {
    const tools = TOOL_CATALOG.filter((tool) => tool.group === group);
    if (tools.length === 0) continue;
    lines.push(GROUP_TITLES[group]);
    for (const tool of tools) {
      lines.push(`  ${tool.id.padEnd(16)} ${tool.title.padEnd(36)} ${STATUS_LABEL[tool.status]}`);
    }
    lines.push("");
  }
  return lines;
}

/** What `flisk tool add --json` reports for one tool, before anything runs. */
export function describeTool(tool: ToolEntry, options: { name?: string; stack?: string } = {}) {
  const base = { id: tool.id, title: tool.title, group: tool.group, status: tool.status };
  switch (tool.status) {
    case "resource":
      return { ...base, command: ["flisk", ...resourceArgs(tool, options)].join(" ") };
    case "built-in":
      return { ...base, note: tool.note };
    case "manual":
      return { ...base, reason: tool.reason, steps: tool.steps };
    case "rejected":
      return { ...base, reason: tool.reason, instead: tool.instead };
  }
}

function unknownTool(input: string): FliskError {
  return new FliskError(`Flisk does not know the tool "${input}".`, [
    `Use one of: ${toolIds().join(", ")}.`,
    "See them grouped with: flisk tool add",
  ]);
}

function rejectedError(tool: Extract<ToolEntry, { status: "rejected" }>): FliskError {
  return new FliskError(`flisk tool add does not add ${tool.title}. ${tool.reason}`, [
    "Use instead:",
    ...tool.instead.map((line) => `  ${line}`),
  ]);
}

type Spawn = typeof spawnSync;

/** Runs `flisk resource` for a tool. Text mode streams its output; --json returns its envelope's data. */
export function runResource(
  args: string[],
  json: boolean,
  invocation: CliInvocation = cliInvocation(),
  spawn: Spawn = spawnSync,
): unknown {
  const [command, ...prefix] = invocation;
  const result = spawn(command, [...prefix, ...args], {
    encoding: "utf8",
    stdio: json ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (!json) {
    if (result.status !== 0) {
      throw new FliskError(`flisk ${args.slice(0, 2).join(" ")} failed.`, [
        `Run it yourself to see why: flisk ${args.join(" ")}`,
      ]);
    }
    return undefined;
  }
  const stdout = String(result.stdout ?? "").trim();
  let envelope: { data?: unknown; errors?: Array<{ message?: string }> } = {};
  try {
    envelope = JSON.parse(stdout.split("\n").pop() ?? "{}");
  } catch {
    // fall through to the failure below
  }
  if (result.status !== 0 || envelope.data === undefined || envelope.data === null) {
    const message = envelope.errors?.[0]?.message ?? `flisk ${args.slice(0, 2).join(" ")} failed`;
    throw new FliskError(message, [`Run it yourself to see why: flisk ${args.join(" ")}`]);
  }
  return envelope.data;
}

/** The whole action, without the JSON wrapper, so tests can call it. */
export function addTool(
  input: string | undefined,
  name: string | undefined,
  options: AddOptions,
  run: (args: string[], json: boolean) => unknown = (args, json) => runResource(args, json),
): unknown {
  if (!input) {
    if (options.json) return { tools: TOOL_CATALOG.map((tool) => describeTool(tool)) };
    for (const line of formatToolList()) console.log(line);
    return undefined;
  }
  // `flisk tool add google cloud` and `flisk tool add spring boot` name one tool in two words, not a tool and a resource name.
  const joined = name ? findTool(`${input} ${name}`) : undefined;
  if (joined) name = undefined;
  const tool = joined ?? findTool(input);
  if (!tool) throw unknownTool(input);
  const described = describeTool(tool, { name, stack: options.stack });

  switch (tool.status) {
    case "rejected":
      throw rejectedError(tool);
    case "built-in":
      if (!options.json) console.log(`${chalk.green("✓")} ${tool.title}: ${tool.note}`);
      return described;
    case "manual":
      if (!options.json) {
        console.log(`${chalk.yellow("!")} ${tool.title}: ${tool.reason}`);
        console.log("");
        tool.steps.forEach((step, index) => {
          console.log(`  ${index + 1}. ${step}`);
        });
      }
      return described;
    case "resource": {
      const args = resourceArgs(tool, {
        name,
        stack: options.stack,
        dryRun: options.dryRun,
        json: options.json,
      });
      if (!options.json) console.log(chalk.gray(`$ flisk ${args.join(" ")}`));
      const resource = run(args, Boolean(options.json));
      if (!options.json && tool.next) console.log(`\nNext: ${tool.next}`);
      return { ...described, ...(options.json ? { resource } : {}) };
    }
  }
}

const toolAddCommand = addYesOption(new Command("add"))
  .description(
    "Add a tool by name (react, postgresql, fastapi, rag…); cloud providers are rejected",
  )
  .argument("[tool]", "The tool to add; leave it out to list every tool")
  .argument("[name]", "Resource name (default: one per tool, for example web, api, db)")
  .option(
    "-s, --stack <stack>",
    "Stack to assign the resource to (default: as flisk resource picks it)",
  )
  .option("--dry-run", "Preview the resource without writing files or reserving a port", false)
  .option("--json", "Print one JSON envelope on stdout; implies --yes", false)
  .addHelpText(
    "after",
    "\nExamples:\n  flisk tool add\n  flisk tool add react\n  flisk tool add postgresql\n  flisk tool add fastapi orders-api --stack shop\n  flisk tool add rag --dry-run",
  )
  .action(async (tool: string | undefined, name: string | undefined, options: AddOptions) => {
    if (options.json) {
      await runJsonCommand("TOOL_ADD_FAILED", "flisk tool add", async () => ({
        data: addTool(tool, name, options),
      }));
      return;
    }
    await runCommand(async () => {
      addTool(tool, name, options);
    });
  });

/** `flisk tool`: tools by their everyday name. `add` is its only subcommand. */
export const toolCommand = new Command("tool")
  .description(
    "Add a tool by name: flisk tool add react, postgresql, fastapi, rag (cloud is rejected)",
  )
  .addCommand(toolAddCommand)
  .addHelpText("after", "\nExamples:\n  flisk tool add\n  flisk tool add react");
