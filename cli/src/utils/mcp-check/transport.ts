// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import type { JsonObject, McpCheckOptions, HttpRequest, HttpResponse, RpcResponse } from "./types.js";
import  {parseRpcBody} from "./protocol.js"
import {isFinalNetworkError} from './taxonomy.js'
const ACCEPT = "application/json, text/event-stream";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class McpProbe {
  private sessionId: string | null = null;
  private nextId = 1;

  constructor(
    private readonly url: string,
    private readonly options: Required<
      Pick<McpCheckOptions, "userAgent" | "timeoutMs" | "retryDelayMs">
    >,
  ) {}

  async http(target: string, request: HttpRequest = {}): Promise<HttpResponse> {
    const method = request.method ?? "POST";
    const headers: Record<string, string> = { "user-agent": this.options.userAgent };
    if (method === "POST") headers["content-type"] = "application/json";
    const accept = request.accept === undefined ? ACCEPT : request.accept;
    if (accept !== null) headers.accept = accept;
    if (this.sessionId && target === this.url) headers["mcp-session-id"] = this.sessionId;
    let lastError = "";
    // One try and two retries. Only a network error is retried: an HTTP status is the server's answer, and so is a
    // refused connection on this machine.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) await sleep(this.options.retryDelayMs);
      try {
        const response = await fetch(target, {
          method,
          headers,
          body: method === "POST" ? request.body : undefined,
          redirect: "follow",
          signal: AbortSignal.timeout(this.options.timeoutMs),
        });
        return {
          status: response.status,
          contentType: response.headers.get("content-type") ?? "",
          body: Buffer.from(await response.arrayBuffer()),
          sessionId: response.headers.get("mcp-session-id"),
        };
      } catch (error) {
        const cause = (error as { cause?: { code?: string; message?: string } }).cause;
        lastError = `${error instanceof Error ? error.message : String(error)}${cause?.code ? ` (${cause.code})` : cause?.message ? ` (${cause.message})` : ""}`;
        if (isFinalNetworkError(target, error)) break;
      }
    }
    return { status: 0, contentType: "", body: Buffer.alloc(0), sessionId: null, error: lastError };
  }

  async rpc(method: string, params?: unknown, request: HttpRequest = {}): Promise<RpcResponse> {
    const message: JsonObject = { jsonrpc: "2.0", id: this.nextId++, method };
    if (params !== undefined) message.params = params;
    const response = await this.http(this.url, { ...request, body: JSON.stringify(message) });
    if (method === "initialize" && response.sessionId) this.sessionId = response.sessionId;
    return {
      status: response.status,
      message: parseRpcBody(response.body.toString("utf8")),
      error: response.error,
    };
  }

  async notify(method: string): Promise<void> {
    await this.http(this.url, { body: JSON.stringify({ jsonrpc: "2.0", method }) });
  }
}