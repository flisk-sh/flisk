import type { McpTool, McpToolPolicy } from "./server.js";
export interface McpPolicyOptions {
    readOnly?: boolean;
    /** Comma-separated tool names (the `--tools` value). */
    tools?: string;
}
/**
 * Builds the policy for `flisk mcp --read-only` and `--tools a,b`; the environment variables FLISK_MCP_READ_ONLY and
 * FLISK_MCP_TOOLS apply when the flag is absent. Read-only keeps only tools annotated `readOnlyHint`; an allowlist keeps only
 * the named tools; both together keep the read-only tools that are named. Returns null when nothing is restricted.
 */
export declare function resolveToolPolicy(tools: readonly McpTool[], options: McpPolicyOptions, env?: NodeJS.ProcessEnv): McpToolPolicy | null;
