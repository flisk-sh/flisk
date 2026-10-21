// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { isHostPortAvailable } from "../host-port-plan.js";
import { hasLocalListener } from "../port-listener-probe.js";

const servers: Server[] = [];

function listen(host: string): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer((socket) => socket.end());
    servers.push(server);
    server.listen(0, host, () => resolve((server.address() as { port: number }).port));
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
});

describe("hasLocalListener", () => {
  it("sees a process listening on every interface", async () => {
    const port = await listen("0.0.0.0");
    expect(await hasLocalListener(port)).toBe(true);
    expect(await isHostPortAvailable(port)).toBe(false);
  });

  it("sees a process listening on loopback", async () => {
    const port = await listen("127.0.0.1");
    expect(await hasLocalListener(port)).toBe(true);
    expect(await isHostPortAvailable(port)).toBe(false);
  });

  it("reports a port nobody listens on as free", async () => {
    const port = await listen("127.0.0.1");
    await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
    expect(await hasLocalListener(port)).toBe(false);
    expect(await isHostPortAvailable(port)).toBe(true);
  });
});
