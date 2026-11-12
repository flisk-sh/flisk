export type ToolGroup = "frontend" | "backend" | "data" | "ai" | "devops" | "guidewire" | "cloud";
interface ToolBase {
    /** The id people type: `flisk tool add <id>`. */
    id: string;
    title: string;
    group: ToolGroup;
    /** Other spellings that resolve to this tool ("next.js", "spring boot"). */
    aliases: string[];
}
/** A tool Flisk generates: one `flisk resource` command. */
export interface ResourceTool extends ToolBase {
    status: "resource";
    /** The resource name used when `flisk tool add` is given none. */
    defaultName: string;
    /** The `flisk resource` arguments after the name. */
    args: string[];
    /** A line to print after the resource is created, for what to do next. */
    next?: string;
}
/** A tool that is already part of every Flisk stack. */
export interface BuiltInTool extends ToolBase {
    status: "built-in";
    note: string;
}
/** A tool Flisk cannot generate: the steps to run it under Flisk yourself. */
export interface ManualTool extends ToolBase {
    status: "manual";
    /** The service name the steps use for `{name}`; a tool with none (a CI workflow) takes no name. */
    defaultName?: string;
    reason: string;
    steps: string[];
}
/** A tool `flisk tool add` refuses: it is outside what Flisk does. */
export interface RejectedTool extends ToolBase {
    status: "rejected";
    reason: string;
    /** Local tools that cover the same need. */
    instead: string[];
}
export type ToolEntry = ResourceTool | BuiltInTool | ManualTool | RejectedTool;
export declare const TOOL_CATALOG: readonly ToolEntry[];
/** "Next.js", "spring boot" and "Spring_Boot" all become one key, so people can type a tool the way they say it. */
export declare function toolKey(input: string): string;
/** The catalog entry for what someone typed, by id or alias; undefined when Flisk does not know it. */
export declare function findTool(input: string): ToolEntry | undefined;
/** The ids `flisk tool add` accepts, for errors and completion. */
export declare function toolIds(): string[];
/** The `flisk resource` arguments for a tool that maps to one resource. */
export declare function resourceArgs(tool: ResourceTool, options: {
    name?: string;
    stack?: string;
    dryRun?: boolean;
    json?: boolean;
}): string[];
/** A manual tool's steps with `{name}` filled in: the given name, or the tool's default. */
export declare function manualSteps(tool: ManualTool, name?: string): string[];
export {};
