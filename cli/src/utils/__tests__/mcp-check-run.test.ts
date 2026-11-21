// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { runChecks } from "../mcp-check/run.js";
import type {
  HttpRequest,
  HttpResponse,
  McpCheckReport,
  McpTransport,
  RpcResponse,
} from "../mcp-check/types.js";

const TARGET = "http://fake.test/mcp";

const NO_ANSWER: RpcResponse = { status: 0, message: null, error: "connect ECONNREFUSED" };

function ok(result: unknown): RpcResponse {
  return { status: 200, message: { jsonrpc: "2.0", id: 1, result } };
}

function rpcError(code: number, message: string): RpcResponse {
  return { status: 200, message: { jsonrpc: "2.0", id: 1, error: { code, message } } };
}

function httpResponse(status: number): HttpResponse {
  return { status, contentType: "", body: Buffer.alloc(0), sessionId: null };
}

interface Script {
  rpc: Record<string, RpcResponse>;
  http: (target: string, request: HttpRequest) => HttpResponse;
}

const ECHO_TOOL = {
  name: "echo",
  annotations: { readOnlyHint: true },
  inputSchema: { type: "object", properties: {} },
};

// A server that passes every check. Each test overrides only the answer it wants to break.
function healthy(overrides: Record<string, RpcResponse> = {}): Script {
  return {
    rpc: {
      initialize: ok({ serverInfo: { name: "fake" }, capabilities: { tools: {} } }),
      "tools/list": ok({ tools: [ECHO_TOOL] }),
      "tools/list (json-only)": ok({ tools: [ECHO_TOOL] }),
      "tools/call": ok({ content: [{ type: "text", text: "hi" }] }),
      "prompts/list": rpcError(-32601, "Method not found"),
      "no/such_method": rpcError(-32601, "Method not found"),
      ...overrides,
    },
    http: (_target, request) => httpResponse(request.method === "GET" ? 405 : 400),
  };
}

// A scripted transport: no socket, no retries, and a record of every call the driver makes.
function fake(script: Script): McpTransport & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async http(target, request = {}) {
      calls.push(`http:${request.method ?? "POST"}`);
      return script.http(target, request);
    },
    async rpc(method, _params, request = {}) {
      calls.push(`rpc:${method}`);
      const key =
        method === "tools/list" && request.accept === "application/json"
          ? "tools/list (json-only)"
          : method;
      return script.rpc[key] ?? NO_ANSWER;
    },
    async notify(method) {
      calls.push(`notify:${method}`);
    },
  };
}

function byName(report: McpCheckReport, name: string) {
  return report.checks.find((check) => check.check === name);
}

describe("runChecks", () => {
  it("passes every check against a healthy server and skips tools/call by default", async () => {
    const report = await runChecks(fake(healthy()), TARGET, { icon: false });
    expect(report.didPass).toBe(true);
    expect(report.failures).toBe(0);
    expect(report.serverName).toBe("fake");
    expect(byName(report, "readOnlyHint echo")?.didPass).toBe(true);
    expect(byName(report, "tools/call")?.isSkipped).toBe(true);
  });

  it("calls each tool once when asked to", async () => {
    const transport = fake(healthy());
    const report = await runChecks(transport, TARGET, { icon: false, call: true });
    expect(report.didPass).toBe(true);
    expect(byName(report, "tools/call echo")?.didPass).toBe(true);
    expect(transport.calls.filter((call) => call === "rpc:tools/call")).toHaveLength(1);
  });

  it("stops after initialize when nothing answers at the address", async () => {
    const transport = fake(healthy({ initialize: NO_ANSWER }));
    const report = await runChecks(transport, TARGET, { icon: false });
    expect(report.didPass).toBe(false);
    expect(report.failures).toBe(1);
    expect(report.serverName).toBeNull();
    expect(transport.calls).toEqual(["rpc:initialize"]);
  });

  it("fails tools/list when the server answers with an error status", async () => {
    const report = await runChecks(
      fake(healthy({ "tools/list": { status: 500, message: null } })),
      TARGET,
      { icon: false },
    );
    expect(byName(report, "tools/list")?.didPass).toBe(false);
    expect(report.failures).toBe(1);
  });

  it("fails a tool that is not annotated read-only", async () => {
    const unannotated = { name: "echo", inputSchema: { type: "object", properties: {} } };
    const report = await runChecks(
      fake(healthy({ "tools/list": ok({ tools: [unannotated] }) })),
      TARGET,
      { icon: false },
    );
    expect(byName(report, "readOnlyHint echo")?.didPass).toBe(false);
    expect(report.failures).toBe(1);
  });

  it("fails a sample call that comes back with isError", async () => {
    const report = await runChecks(
      fake(
        healthy({
          "tools/call": ok({ isError: true, content: [{ type: "text", text: "boom" }] }),
        }),
      ),
      TARGET,
      { icon: false, call: true },
    );
    expect(byName(report, "tools/call echo")?.didPass).toBe(false);
    expect(report.failures).toBe(1);
  });
});