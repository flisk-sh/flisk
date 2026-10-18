// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import type { DiscoveredResource } from "../../types/index.js";
import { assignPort, getUsedPorts } from "../port-assignment.js";

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
});
