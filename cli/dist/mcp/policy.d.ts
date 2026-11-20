import type { McpTool, McpToolPolicy } from "./server.js";
/** Small, commonly used subsets for agents that do not need every tool in their context. */
export declare const MCP_TOOL_PROFILES: {
    readonly minimal: readonly ["status", "up", "logs"];
};
export type McpToolProfile = keyof typeof MCP_TOOL_PROFILES;
export interface McpPolicyOptions {
    readOnly?: boolean;
    /** Comma-separated tool names (the `--tools` value). */
    tools?: string;
    /** A named tool subset (the `--profile` value). */
    profile?: string;
}
/**
 * Builds the policy for `flisk mcp --read-only`, `--profile minimal` and `--tools a,b`; the environment variables
 * FLISK_MCP_READ_ONLY, FLISK_MCP_PROFILE and FLISK_MCP_TOOLS apply when the flag is absent. Read-only keeps only tools
 * annotated `readOnlyHint`; a profile or allowlist keeps only the named tools; both together keep the intersection.
 * Returns null when nothing is restricted, so the default list stays complete.
 */
export declare function resolveToolPolicy(tools: readonly McpTool[], options: McpPolicyOptions, env?: NodeJS.ProcessEnv): McpToolPolicy | null;
