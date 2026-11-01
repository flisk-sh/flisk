// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { fetchAgentOverview, httpGet } from "../agent-sessions.js";

let server: http.Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

/** Serves `routes` (path -> status and JSON body) and returns the route URL the CLI would use. */
async function serve(routes: Record<string, [number, unknown]>): Promise<string> {
  server = http.createServer((req, res) => {
    const hit = routes[req.url?.replace("/api/bot", "") ?? ""];
    res.statusCode = hit ? hit[0] : 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(hit ? hit[1] : { error: "not_found" }));
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/bot`;
}

describe("httpGet", () => {
  it("returns ok: true and status 200 for a successful request", async () => {
    server = http.createServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ status: "healthy" }));
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    const res = await httpGet(`http://127.0.0.1:${port}/test`, {}, 5000);
    expect(res).toEqual({
      ok: true,
      status: 200,
      text: '{"status":"healthy"}',
    });
  });

  it("returns ok: false and status 500 for an internal server error", async () => {
    server = http.createServer((_req, res) => {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "internal_error" }));
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    const res = await httpGet(`http://127.0.0.1:${port}/test`, {}, 5000);
    expect(res).toEqual({
      ok: false,
      status: 500,
      text: '{"error":"internal_error"}',
    });
  });

  it("forwards custom request headers", async () => {
    let receivedHeaders: http.IncomingHttpHeaders = {};
    server = http.createServer((req, res) => {
      receivedHeaders = req.headers;
      res.statusCode = 200;
      res.end("ok");
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    const res = await httpGet(
      `http://127.0.0.1:${port}/custom`,
      { "x-custom-token": "secret-123", host: "agent.local" },
      5000,
    );
    expect(res.ok).toBe(true);
    expect(receivedHeaders["x-custom-token"]).toBe("secret-123");
    expect(receivedHeaders.host).toBe("agent.local");
  });

  it("rejects on connection failure or connection refused", async () => {
    await expect(httpGet("http://127.0.0.1:1/nonexistent", {}, 1000)).rejects.toThrow();
  });

  it("rejects when the request times out", async () => {
    server = http.createServer((_req, _res) => {
      // Intentionally do not end response to trigger timeout
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    await expect(httpGet(`http://127.0.0.1:${port}/timeout`, {}, 50)).rejects.toThrow();
  });
});

describe("fetchAgentOverview", () => {
  it("combines /ready and /sessions", async () => {
    const url = await serve({
      "/ready": [200, { ready: true }],
      "/sessions": [200, { sessions: [{ sessionId: "s1", status: "idle" }], total: 1 }],
    });
    expect(await fetchAgentOverview(url)).toEqual({
      state: "up",
      ready: true,
      sessions: {
        total: 1,
        sessions: [{ sessionId: "s1", lastActivity: null, status: "idle", checkpointBytes: null }],
      },
    });
  });

  it("reports an older agent as up with no session list", async () => {
    const url = await serve({ "/ready": [200, { ready: true }] });
    expect(await fetchAgentOverview(url)).toEqual({ state: "up", ready: true, sessions: null });
  });

  it("reports not ready when the checkpoint store is down", async () => {
    const url = await serve({
      "/ready": [503, { ready: false }],
      "/sessions": [500, { error: "internal_error" }],
    });
    expect(await fetchAgentOverview(url)).toMatchObject({ state: "up", ready: false });
  });

  it("reports not-running when nothing answers", async () => {
    const url = await serve({});
    server?.close();
    server = undefined;
    expect(await fetchAgentOverview(url, 500)).toEqual({ state: "not-running" });
  });
});
