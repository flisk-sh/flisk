// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoveredResource } from "../../types/index.js";
import {
  assignPort,
  checkPortStatus,
  findAvailablePort,
  getUsedPorts,
} from "../port-assignment.js";

// Port probing goes through node:net. These mocks stand in for real sockets so the tests
// never bind or connect to a real port.
const { createConnectionMock, createServerMock } = vi.hoisted(() => ({
  createConnectionMock: vi.fn(),
  createServerMock: vi.fn(),
}));

vi.mock("node:net", () => ({
  createConnection: createConnectionMock,
  createServer: createServerMock,
}));

type ProbeOutcome = "connect" | "refuse" | "timeout";
type BindOutcome = "listening" | "EADDRINUSE" | "EACCES" | "hang";

class FakeSocket extends EventEmitter {
  timeoutHandler: (() => void) | undefined;
  destroy = vi.fn();
  setTimeout = vi.fn((_ms: number, handler: () => void) => {
    this.timeoutHandler = handler;
    return this;
  });
}

class FakeServer extends EventEmitter {
  listen = vi.fn();
  close = vi.fn((callback?: () => void) => callback?.());
}

// Each probe of a port gets the outcome chosen for it. Outcomes fire on the next microtask,
// after port-assignment.ts has attached its listeners.
function probePorts(outcomeFor: (port: number) => ProbeOutcome): void {
  createConnectionMock.mockImplementation(
    (options: { port: number; host: string }, onConnect: () => void) => {
      const socket = new FakeSocket();
      const outcome = outcomeFor(options.port);
      queueMicrotask(() => {
        if (outcome === "connect") onConnect();
        else if (outcome === "refuse") socket.emit("error", new Error("ECONNREFUSED"));
        else socket.timeoutHandler?.();
      });
      return socket;
    },
  );
}

function bindWith(outcome: BindOutcome): void {
  createServerMock.mockImplementation(() => {
    const server = new FakeServer();
    server.listen.mockImplementation(() => {
      queueMicrotask(() => {
        if (outcome === "listening") server.emit("listening");
        else if (outcome !== "hang") {
          server.emit("error", Object.assign(new Error(outcome), { code: outcome }));
        }
      });
    });
    return server;
  });
}

beforeEach(() => {
  createConnectionMock.mockReset();
  createServerMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getUsedPorts", () => {
  it("should return empty set for no resources", () => {
    const usedPorts = getUsedPorts([]);
    expect(usedPorts.size).toBe(0);
  });

  it("should collect ports from resources", () => {
    const resources: DiscoveredResource[] = [
      {
        name: "svc-a",
        port: 3000,
        path: "/tmp",
        configPath: "/tmp/a/service.json",
        config: { appName: "svc-a", appType: "backend" },
      },
      {
        name: "svc-b",
        port: 4000,
        path: "/tmp",
        configPath: "/tmp/b/service.json",
        config: { appName: "svc-b", appType: "frontend" },
      },
    ];

    const usedPorts = getUsedPorts(resources);
    expect(usedPorts.has(3000)).toBe(true);
    expect(usedPorts.has(4000)).toBe(true);
    expect(usedPorts.size).toBe(2);
  });

  it("should skip resources without ports", () => {
    const resources: DiscoveredResource[] = [
      { name: "svc-a", port: undefined, path: "/tmp", configPath: "/tmp/a/service.json" },
      { name: "svc-b", port: 0, path: "/tmp", configPath: "/tmp/b/service.json" },
    ];

    const usedPorts = getUsedPorts(resources);
    expect(usedPorts.size).toBe(0);
  });
});

describe("assignPort", () => {
  it("should assign base port when no resources exist", () => {
    const port = assignPort("backend", []);
    expect(port).toBe(4000);
  });

  it("should assign next available port", () => {
    const existing: DiscoveredResource[] = [
      {
        name: "svc-a",
        port: 4000,
        path: "/tmp",
        configPath: "/tmp/a/service.json",
        config: { appName: "svc-a", appType: "backend" },
      },
    ];

    const port = assignPort("backend", existing);
    expect(port).toBe(4001);
  });

  it("should assign frontend port from frontend range", () => {
    const port = assignPort("frontend", []);
    expect(port).toBe(3000);
  });

  it("should assign worker port from worker range", () => {
    const port = assignPort("worker", []);
    expect(port).toBe(6000);
  });

  it("should skip used ports", () => {
    const existing: DiscoveredResource[] = [
      {
        name: "front-a",
        port: 3000,
        path: "/tmp",
        configPath: "/tmp/a/service.json",
        config: { appName: "front-a", appType: "frontend" },
      },
      {
        name: "front-b",
        port: 3001,
        path: "/tmp",
        configPath: "/tmp/b/service.json",
        config: { appName: "front-b", appType: "frontend" },
      },
      {
        name: "front-c",
        port: 3002,
        path: "/tmp",
        configPath: "/tmp/c/service.json",
        config: { appName: "front-c", appType: "frontend" },
      },
    ];

    const port = assignPort("frontend", existing);
    expect(port).toBe(3003);
  });

  it("should throw when no ports available in range", () => {
    // Fill all frontend ports (3000-3999)
    const existing: DiscoveredResource[] = [];
    for (let i = 3000; i <= 3999; i++) {
      existing.push({
        name: `svc-${i}`,
        port: i,
        path: "/tmp",
        configPath: `/tmp/svc-${i}/service.json`,
        config: { appName: `svc-${i}`, appType: "frontend" },
      });
    }

    expect(() => assignPort("frontend", existing)).toThrow("No available ports");
  });

  it("should assign the last port of the range (inclusive boundary)", () => {
    const existing: DiscoveredResource[] = [];
    for (let i = 3000; i <= 3998; i++) {
      existing.push({
        name: `svc-${i}`,
        port: i,
        path: "/tmp",
        configPath: `/tmp/svc-${i}/service.json`,
        config: { appName: `svc-${i}`, appType: "frontend" },
      });
    }

    expect(assignPort("frontend", existing)).toBe(3999);
  });

  it("should ignore used ports outside the resource type's range", () => {
    const existing: DiscoveredResource[] = [
      {
        name: "back-a",
        port: 4000,
        path: "/tmp",
        configPath: "/tmp/a/service.json",
        config: { appName: "back-a", appType: "backend" },
      },
    ];

    expect(assignPort("frontend", existing)).toBe(3000);
  });

  it("should include the range and config hint when the range is exhausted", () => {
    const existing: DiscoveredResource[] = [];
    for (let i = 6000; i <= 6999; i++) {
      existing.push({
        name: `w-${i}`,
        port: i,
        path: "/tmp",
        configPath: `/tmp/w-${i}/service.json`,
        config: { appName: `w-${i}`, appType: "worker" },
      });
    }

    expect(() => assignPort("worker", existing)).toThrow(
      /No available ports in range 6000-6999\. Check TILT_RESOURCE_DEFAULTS\.star/,
    );
  });
});

describe("findAvailablePort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return the base port when nothing is listening on it", async () => {
    probePorts(() => "refuse");

    await expect(findAvailablePort(3000)).resolves.toBe(3000);
    expect(createConnectionMock).toHaveBeenCalledTimes(1);
    expect(createConnectionMock.mock.calls[0]?.[0]).toEqual({ port: 3000, host: "127.0.0.1" });
  });

  it("should skip ports that accept connections", async () => {
    probePorts((port) => (port < 3002 ? "connect" : "refuse"));

    await expect(findAvailablePort(3000)).resolves.toBe(3002);
    expect(createConnectionMock).toHaveBeenCalledTimes(3);
  });

  it("should treat a connect that times out as taken", async () => {
    probePorts((port) => (port === 3000 ? "timeout" : "refuse"));

    await expect(findAvailablePort(3000)).resolves.toBe(3001);
  });

  it("should return null when every attempt is taken", async () => {
    probePorts(() => "connect");

    await expect(findAvailablePort(3000, 3)).resolves.toBeNull();
    expect(createConnectionMock).toHaveBeenCalledTimes(3);
  });

  it("should default to ten attempts", async () => {
    probePorts(() => "connect");

    await expect(findAvailablePort(3000)).resolves.toBeNull();
    expect(createConnectionMock).toHaveBeenCalledTimes(10);
  });

  it("should stop at maxAttempts without probing further", async () => {
    probePorts((port) => (port <= 3002 ? "connect" : "refuse"));

    await expect(findAvailablePort(3000, 3)).resolves.toBeNull();
    await expect(findAvailablePort(3000, 4)).resolves.toBe(3003);
  });
});

describe("checkPortStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should report running when the port is already in use", async () => {
    bindWith("EADDRINUSE");

    await expect(checkPortStatus(3000)).resolves.toBe("running");
    const server = createServerMock.mock.results[0]?.value as FakeServer;
    expect(server.listen).toHaveBeenCalledWith(3000, "127.0.0.1");
  });

  it("should report stopped when the port can be bound and is then released", async () => {
    bindWith("listening");

    await expect(checkPortStatus(3000)).resolves.toBe("stopped");
    const server = createServerMock.mock.results[0]?.value as FakeServer;
    expect(server.close).toHaveBeenCalledTimes(1);
  });

  it("should report unknown for other bind errors", async () => {
    bindWith("EACCES");

    await expect(checkPortStatus(80)).resolves.toBe("unknown");
  });

  it("should report unknown and close the server when binding never settles", async () => {
    vi.useFakeTimers();
    bindWith("hang");

    const result = checkPortStatus(3000);
    await vi.advanceTimersByTimeAsync(3000);

    await expect(result).resolves.toBe("unknown");
    const server = createServerMock.mock.results[0]?.value as FakeServer;
    expect(server.close).toHaveBeenCalledTimes(1);
  });
});
