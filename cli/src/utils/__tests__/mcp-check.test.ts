// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  type FakeMcpServer,
  type FakeMcpServerOptions,
  startFakeMcpServer,
} from "../../test-support/fake-mcp-server.js";
import {
  buildPromptArguments,
  buildSampleArguments,
  iconUrlFor,
  type McpCheckReport,
  parseRpcBody,
  runMcpCheck,
} from "../mcp-check.js";

let server: FakeMcpServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function check(
  fake: FakeMcpServerOptions = {},
  options: Parameters<typeof runMcpCheck>[1] = {},
): Promise<McpCheckReport> {
  server = await startFakeMcpServer(fake);
  return runMcpCheck(server.url, { retryDelayMs: 0, timeoutMs: 5_000, ...options });
}

function byName(report: McpCheckReport, name: string) {
  return report.checks.find((check) => check.check === name);
}

function failed(report: McpCheckReport): string[] {
  return report.checks.filter((check) => !check.didPass).map((check) => check.check);
}

describe("runMcpCheck", () => {
  it("passes a server that follows every rule, without calling any tool", async () => {
    const report = await check();
    expect(failed(report)).toEqual([]);
    expect(report).toMatchObject({ didPass: true, failures: 0, serverName: "fake-mcp" });
    expect(report.checks.map((c) => c.check)).toEqual([
      "initialize",
      "tools/list",
      "readOnlyHint lookup",
      "readOnlyHint ping",
      "tools/call",
      "prompts/list",
      "prompts/get explain",
      "unknown method is refused (-32601)",
      "bad JSON is refused (HTTP 400)",
      "GET is refused (HTTP 405)",
      "a JSON-only Accept header is served (not 406)",
      "icon-512.png is a PNG",
    ]);
    expect(byName(report, "tools/call")).toMatchObject({ isSkipped: true, didPass: true });
    // The default is list-only: no tool was called.
    expect(server?.requests.filter((r) => r.rpcMethod === "tools/call")).toEqual([]);
  });

  it("calls each tool once with arguments built from its inputSchema when asked", async () => {
    const report = await check({}, { call: true });
    expect(failed(report)).toEqual([]);
    const calls = server?.requests.filter((r) => r.rpcMethod === "tools/call") ?? [];
    expect(calls.map((r) => r.params)).toEqual([
      { name: "lookup", arguments: { query: "example", limit: 3 } },
      { name: "ping", arguments: {} },
    ]);
    expect(byName(report, "tools/call lookup")?.didPass).toBe(true);
  });

  it("fills a prompt's required arguments for prompts/get", async () => {
    await check();
    const get = server?.requests.find((r) => r.rpcMethod === "prompts/get");
    expect(get?.params).toEqual({ name: "explain", arguments: { topic: "example" } });
  });

  it("sends a User-Agent and the MCP Accept header", async () => {
    await check({}, { userAgent: "flisk-mcp-check/test" });
    expect(server?.requests.every((r) => r.userAgent === "flisk-mcp-check/test")).toBe(true);
    const init = server?.requests.find((r) => r.rpcMethod === "initialize");
    expect(init?.accept).toBe("application/json, text/event-stream");
  });

  it("reads answers in event-stream framing", async () => {
    const report = await check({ isEventStream: true });
    expect(failed(report)).toEqual([]);
  });

  it("fails a tool without readOnlyHint true", async () => {
    const report = await check({ isReadOnly: false });
    expect(failed(report)).toEqual(["readOnlyHint lookup"]);
    expect(report.didPass).toBe(false);
  });

  it("accepts a server with no prompts capability that refuses prompts/list", async () => {
    const report = await check({ hasPrompts: false });
    expect(failed(report)).toEqual([]);
    expect(byName(report, "prompts/list")?.detail).toContain("no prompts capability");
  });

  it("fails each HTTP rule for its own reason", async () => {
    const report = await check({
      getStatus: 200,
      badJsonStatus: 200,
      isJsonOnlyRejected: true,
      hasIcon: false,
    });
    expect(failed(report)).toEqual([
      "bad JSON is refused (HTTP 400)",
      "GET is refused (HTTP 405)",
      "a JSON-only Accept header is served (not 406)",
      "icon-512.png is a PNG",
    ]);
  });

  it("skips the icon check with icon: false", async () => {
    const report = await check({ hasIcon: false }, { icon: false });
    expect(failed(report)).toEqual([]);
    expect(byName(report, "icon-512.png is a PNG")).toBeUndefined();
    expect(report.iconUrl).toBeNull();
  });

  it("retries a request that hit a network error twice", async () => {
    const report = await check({ dropFirstRequests: 2 });
    expect(failed(report)).toEqual([]);
    const inits = server?.requests.filter((r) => r.path === "/mcp").slice(0, 3);
    expect(inits).toHaveLength(3);
  });

  it("stops after initialize when nothing answers, with one failing check", async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", () => resolve()));
    const { port } = closed.address() as AddressInfo;
    await new Promise<void>((resolve) => closed.close(() => resolve()));
    const url = new URL("/mcp", `http://127.0.0.1:${port}`).toString();
    const report = await runMcpCheck(url, { retryDelayMs: 0, timeoutMs: 2_000 });
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0]).toMatchObject({ check: "initialize", didPass: false });
    expect(report.checks[0]?.detail).toContain("no answer");
  });
});

describe("buildSampleArguments", () => {
  it("fills only required properties, honouring defaults, enums, formats and bounds", () => {
    expect(
      buildSampleArguments({
        type: "object",
        properties: {
          url: { type: "string", format: "uri" },
          mode: { type: "string", enum: ["fast", "slow"] },
          count: { type: "integer", minimum: 2, maximum: 5 },
          ratio: { type: "number", exclusiveMinimum: 0 },
          flag: { type: "boolean" },
          tags: { type: "array", items: { type: "string" }, minItems: 1 },
          nested: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
          size: { type: "string", default: "large" },
          either: { anyOf: [{ type: "null" }, { type: "integer" }] },
          code: { type: "string", minLength: 10 },
          skipped: { type: "string" },
        },
        required: [
          "url",
          "mode",
          "count",
          "ratio",
          "flag",
          "tags",
          "nested",
          "size",
          "either",
          "code",
        ],
      }),
    ).toEqual({
      url: "https://example.com",
      mode: "fast",
      count: 2,
      ratio: 1,
      flag: true,
      tags: ["example"],
      nested: { id: "example" },
      size: "large",
      either: 1,
      code: "examplexxx",
    });
  });

  it("gives an empty object for a missing or empty schema", () => {
    expect(buildSampleArguments(undefined)).toEqual({});
    expect(buildSampleArguments({ type: "object" })).toEqual({});
  });
});

describe("helpers", () => {
  it("fills required prompt arguments only", () => {
    expect(
      buildPromptArguments([
        { name: "topic", required: true },
        { name: "tone", required: false },
      ]),
    ).toEqual({ topic: "example" });
  });

  it("finds the icon beside the endpoint", () => {
    expect(iconUrlFor("https://mcp.example.com/mcp")).toBe("https://mcp.example.com/icon-512.png");
    expect(iconUrlFor("https://api.shop.localhost/api/docs/mcp")).toBe(
      "https://api.shop.localhost/api/docs/icon-512.png",
    );
  });

  it("parses plain JSON and event-stream bodies", () => {
    expect(parseRpcBody('{"jsonrpc":"2.0","id":1,"result":{}}')).toMatchObject({ id: 1 });
    expect(
      parseRpcBody('event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{}}\n\n'),
    ).toMatchObject({
      id: 2,
    });
    expect(parseRpcBody("not json")).toBeNull();
  });
});
