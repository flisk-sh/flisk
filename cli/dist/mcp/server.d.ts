/**
 * A minimal Model Context Protocol server over newline-delimited JSON-RPC 2.0 (the stdio transport). It implements only
 * what a tools-only server needs: initialize, ping, tools/list and tools/call. Keeping it dependency-free keeps the
 * published CLI small; the protocol surface used here is stable across the listed protocol versions.
 */
/** Behavior hints a client shows or uses to decide whether to ask before calling a tool (MCP 2025-03-26 and later). */
export interface McpToolAnnotations {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
}
export interface McpTool {
    name: string;
    /** Former names that tools/call still accepts, so older agent configs keep working; tools/list shows only `name`. */
    aliases?: readonly string[];
    description: string;
    inputSchema: Record<string, unknown>;
    annotations?: McpToolAnnotations;
    handler: (args: Record<string, unknown>) => Promise<McpToolResult>;
}
export interface McpToolResult {
    /** The JSON-serializable result, sent once as structuredContent. */
    data: unknown;
    isError: boolean;
    /**
     * Optional short text for clients that ignore structuredContent. A tool with a large structured
     * result sets this to a human summary instead of sending the same JSON twice (#4205).
     */
    text?: string;
}
export declare const SUPPORTED_PROTOCOL_VERSIONS: readonly ["2025-06-18", "2025-03-26", "2024-11-05"];
/** The accepted argument name closest to an unknown one, or undefined when none is close. */
export declare function closestArgument(unknown: string, accepted: readonly string[]): string | undefined;
/**
 * Check the arguments against the tool's published schema: when it declares `additionalProperties: false`, an argument it
 * does not list is refused with the accepted names and the closest match. Returns the message, or undefined when all fit.
 */
export declare function unknownArgumentsMessage(inputSchema: Record<string, unknown>, args: Record<string, unknown>): string | undefined;
export interface McpServer {
    /** Handle one line from the client; returns the line to send back, or null for notifications. */
    handleLine(line: string): Promise<string | null>;
}
/** An icon a client may show next to the server (MCP Implementation.icons). */
export interface McpIcon {
    src: string;
    mimeType?: string;
    sizes?: string[];
}
/** Which tools a server exposes: a tool the policy refuses is neither listed nor run, and tools/call explains why. */
export interface McpToolPolicy {
    isAllowed: (tool: McpTool) => boolean;
    refusal: (tool: McpTool) => string;
}
export declare function createMcpServer(allTools: McpTool[], info: {
    name: string;
    version: string;
    icons?: McpIcon[];
}, policy?: McpToolPolicy | null): McpServer;
