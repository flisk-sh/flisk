/**
 * `flisk tool add <tool> [name]`: add a tool by the name people know it by (React, PostgreSQL, FastAPI, RAG).
 *
 * The tool list and what each one does live in utils/tool-catalog.ts. A tool Flisk can generate runs the real
 * `flisk resource` command; a built-in tool says so; a tool Flisk cannot generate prints the steps to run it under Flisk;
 * a cloud provider is rejected with exit 1, because Flisk runs the stack on your own computer.
 */
import { spawnSync } from "node:child_process";
import { Command } from "commander";
import { type CliInvocation } from "../utils/cli-invocation.js";
import { type ToolEntry, type ToolGroup } from "../utils/tool-catalog.js";
export interface AddOptions {
    stack?: string;
    dryRun?: boolean;
    json?: boolean;
    yes?: boolean;
}
/** The catalog as lines, grouped, for `flisk tool add` with no tool. */
export declare function formatToolList(): string[];
/** What `flisk tool add --json` reports for one tool, before anything runs. */
export declare function describeTool(tool: ToolEntry, options?: {
    name?: string;
    stack?: string;
}): {
    id: string;
    title: string;
    group: ToolGroup;
    status: "built-in" | "manual" | "rejected" | "resource";
    command: string;
} | {
    id: string;
    title: string;
    group: ToolGroup;
    status: "built-in" | "manual" | "rejected" | "resource";
    note: string;
} | {
    id: string;
    title: string;
    group: ToolGroup;
    status: "built-in" | "manual" | "rejected" | "resource";
    reason: string;
    steps: string[];
} | {
    id: string;
    title: string;
    group: ToolGroup;
    status: "built-in" | "manual" | "rejected" | "resource";
    reason: string;
    instead: string[];
};
type Spawn = typeof spawnSync;
/** Runs `flisk resource` for a tool. Text mode streams its output; --json returns its envelope's data. */
export declare function runResource(args: string[], json: boolean, invocation?: CliInvocation, spawn?: Spawn): unknown;
/** The whole action, without the JSON wrapper, so tests can call it. */
export declare function addTool(input: string | undefined, name: string | undefined, options: AddOptions, run?: (args: string[], json: boolean) => unknown): unknown;
/** `flisk tool`: tools by their everyday name. `add` is its only subcommand. */
export declare const toolCommand: Command;
export {};
