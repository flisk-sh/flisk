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
import { type ResourceTool, type ToolEntry, type ToolGroup } from "../utils/tool-catalog.js";
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
/**
 * The words after `flisk tool add`: the longest leading run that names a tool, then at most one resource name. So
 * `google cloud platform`, `spring boot api` and `react web` all read the way people mean them.
 */
export declare function resolveWords(words: string[]): {
    tool: ToolEntry;
    name?: string;
};
/** What `flisk tool add` needs from the project before it runs `flisk resource`: its resources and their stacks. */
export interface ProjectView {
    resources: Array<{
        name: string;
        stack?: string;
        type?: string;
    }>;
}
/**
 * Checks that `flisk resource` would otherwise get wrong for a tool: an invalid name, a name already taken (which
 * `flisk resource` would silently register as it is, so the tool would never be added), and a project with several
 * stacks and no --stack.
 */
export declare function checkResource(tool: ResourceTool, name: string, stack: string | undefined, project: ProjectView | undefined): void;
/** Runs `flisk resource` for a tool. Text mode streams its output; --json returns its envelope's data. */
export declare function runResource(args: string[], json: boolean, invocation?: CliInvocation, spawn?: Spawn): unknown;
/** The whole action, without the JSON wrapper, so tests can call it. */
export declare function addTool(words: string[], options: AddOptions, run?: (args: string[], json: boolean) => unknown, project?: () => ProjectView | undefined): unknown;
/** `flisk tool`: tools by their everyday name. `add` is its only subcommand. */
export declare const toolCommand: Command;
export {};
