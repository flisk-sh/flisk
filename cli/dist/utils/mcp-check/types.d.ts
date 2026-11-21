export type JsonObject = Record<string, unknown>;
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
export interface HttpResponse {
    /** 0 when the request never got an answer, after its retries. */
    status: number;
    contentType: string;
    body: Buffer;
    sessionId: string | null;
    error?: string;
}
export interface RpcResponse {
    status: number;
    message: Record<string, unknown> | null;
    error?: string;
}
export interface HttpRequest {
    method?: "GET" | "POST";
    body?: string;
    accept?: string | null;
}
export interface McpTransport {
    http(target: string, request?: HttpRequest): Promise<HttpResponse>;
    rpc(method: string, params?: unknown, request?: HttpRequest): Promise<RpcResponse>;
    notify(method: string): Promise<void>;
}
