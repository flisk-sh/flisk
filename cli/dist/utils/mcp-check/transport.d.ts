import type { HttpRequest, HttpResponse, McpCheckOptions, RpcResponse } from "./types.js";
export declare class McpProbe {
    private readonly url;
    private readonly options;
    private sessionId;
    private nextId;
    constructor(url: string, options: Required<Pick<McpCheckOptions, "userAgent" | "timeoutMs" | "retryDelayMs">>);
    http(target: string, request?: HttpRequest): Promise<HttpResponse>;
    rpc(method: string, params?: unknown, request?: HttpRequest): Promise<RpcResponse>;
    notify(method: string): Promise<void>;
}
