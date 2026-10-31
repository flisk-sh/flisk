export interface McpCheckResult {
    check: string;
    didPass: boolean;
    /** True when the check did not run (for example tools/call without --call); a skipped check never fails. */
    isSkipped?: boolean;
    detail: string;
}
export interface McpCheckReport {
    url: string;
    iconUrl: string | null;
    serverName: string | null;
    didPass: boolean;
    failures: number;
    checks: McpCheckResult[];
}
export interface McpCheckOptions {
    /** Call every tool once with arguments built from its inputSchema. Off by default. */
    call?: boolean;
    /** Check that icon-512.png next to the endpoint is a PNG. On by default. */
    icon?: boolean;
    userAgent?: string;
    timeoutMs?: number;
    /** Delay before each of the two retries of a request that failed with a network error. */
    retryDelayMs?: number;
}
type JsonObject = Record<string, unknown>;
/** The JSON-RPC message in a body, whether the server answered with plain JSON or with an event stream. */
export declare function parseRpcBody(text: string): JsonObject | null;
/** A value that satisfies a JSON Schema in the common cases: the default, an example, the first enum value, or a typed sample. */
export declare function sampleValue(schemaInput: unknown, depth?: number, rootInput?: unknown): unknown;
/** Arguments for one tools/call: a sample value for every required property of the tool's inputSchema. */
export declare function buildSampleArguments(schemaInput: unknown, depth?: number, rootInput?: unknown): JsonObject;
/** Arguments for one prompts/get: "example" for every required prompt argument. */
export declare function buildPromptArguments(argumentsList: unknown): Record<string, string>;
/** icon-512.png beside the endpoint: https://host/mcp has its icon at https://host/icon-512.png. */
export declare function iconUrlFor(url: string): string;
export declare function runMcpCheck(url: string, options?: McpCheckOptions): Promise<McpCheckReport>;
export {};
