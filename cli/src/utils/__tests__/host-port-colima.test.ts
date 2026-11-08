// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({ isLimaBackedDocker: vi.fn() }));

vi.mock("../colima.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../colima.js")>()),
  isLimaBackedDocker: engine.isLimaBackedDocker,
}));

vi.mock("../port-listener-probe.js", () => ({ hasLocalListener: async () => false }));

// A bind on a port below 1024, refused the way macOS refuses a non-root process.
vi.mock("node:net", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:net")>()),
  createServer: () => {
    const server = new EventEmitter() as EventEmitter & { listen: () => void };
    server.listen = () => {
      server.emit("error", Object.assign(new Error("denied"), { code: "EACCES" }));
    };
    return server;
  },
}));

import { isHostPortAvailable } from "../host-port-plan.js";

describe("isHostPortAvailable for a refused privileged port on macOS", () => {
  const platform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: platform });
    engine.isLimaBackedDocker.mockReset();
  });

  it("is free on Docker Desktop, whose helper can publish it", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    engine.isLimaBackedDocker.mockReturnValue(false);

    expect(await isHostPortAvailable(80)).toBe(true);
  });

  it("is not free on Colima, whose forward runs as the user and is refused too", async () => {
    // Regression: Flisk chose port 80 on Colima, so every printed URL failed with nothing listening on the Mac.
    Object.defineProperty(process, "platform", { value: "darwin" });
    engine.isLimaBackedDocker.mockReturnValue(true);

    expect(await isHostPortAvailable(80)).toBe(false);
  });
});
