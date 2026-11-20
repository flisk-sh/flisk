// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { isPortListening, waitForServiceReady } from "../native-runtime.js";

describe("native readiness first probe (issue 4346)", () => {
  it("sends a real HTTP request on the first probe when a health path is set", async () => {
    let requests = 0;
    const server = createHttpServer((_req, res) => {
      requests += 1;
      res.writeHead(200, { "content-length": "2" });
      res.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const ready = await waitForServiceReady(
        { port, healthUrl: `http://127.0.0.1:${port}/health` },
        { isAlive: () => true, timeoutMs: 2_000, intervalMs: 50 },
      );
      expect(ready).toBe(true);
      expect(requests).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("keeps a bare TCP probe for a service with no health path", async () => {
    let requests = 0;
    const server = createHttpServer((_req, res) => {
      requests += 1;
      res.writeHead(200);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const ready = await waitForServiceReady(
        { port, healthUrl: undefined },
        { isAlive: () => true, timeoutMs: 2_000, intervalMs: 50 },
      );
      expect(ready).toBe(true);
      expect(requests).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("closes a bare TCP probe cleanly instead of resetting the connection", async () => {
    const resets: string[] = [];
    let ends = 0;
    const server = createServer((socket) => {
      // A server that writes on accept (as an HTTP server sends its response) sees an
      // ECONNRESET when the client destroys the socket without reading or ending it.
      socket.write("hello");
      socket.on("end", () => {
        ends += 1;
        socket.end();
      });
      socket.on("error", (error) =>
        resets.push((error as NodeJS.ErrnoException).code ?? error.message),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      expect(await isPortListening(port)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(ends).toBeGreaterThan(0);
      expect(resets).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
