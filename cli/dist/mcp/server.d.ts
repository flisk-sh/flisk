/**
 * A minimal Model Context Protocol server over newline-delimited JSON-RPC 2.0 (the stdio transport). It implements only
 * what a tools-only server needs: initialize, ping, tools/list and tools/call. Keeping it dependency-free keeps the
 * published CLI small; the protocol surface used here is stable across the listed protocol versions.
 */
export interface McpTool {
    name: string;
    /** Former names that tools/call still accepts, so older agent configs keep working; tools/list shows only `name`. */
    aliases?: readonly string[];
    description: string;
    inputSchema: Record<string, unknown>;
    handler: (args: Record<string, unknown>) => Promise<McpToolResult>;
}
export interface McpToolResult {
    /** The JSON-serializable result; also returned as text for clients that ignore structured content. */
    data: unknown;
    isError: boolean;
}
export declare const SUPPORTED_PROTOCOL_VERSIONS: readonly ["2025-06-18", "2025-03-26", "2024-11-05"];
export interface McpServer {
    /** Handle one line from the client; returns the line to send back, or null for notifications. */
    handleLine(line: string): Promise<string | null>;
}
export declare function createMcpServer(tools: McpTool[], info: {
    name: string;
    version: string;
}): McpServer;
