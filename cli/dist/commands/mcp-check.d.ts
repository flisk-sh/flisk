import { Command } from "commander";
export interface McpCheckTarget {
    url: string;
    /** The resource the URL was resolved from, or null when a URL was given. */
    resource: string | null;
}
export declare function resolveMcpCheckTarget(target: string): Promise<McpCheckTarget>;
/**
 * `flisk mcp check`. A factory rather than an exported Command, so the command exists once, under `flisk mcp`, for every
 * reader of the command tree (help, completion, the flag contract).
 */
export declare function createMcpCheckCommand(): Command;
