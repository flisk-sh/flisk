// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { createConnection, createServer } from "node:net";
import type { DiscoveredResource, PortAssignableResourceType } from "../types/index.js";
import { PORT_RANGES } from "./constants.js";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createConnection({ port, host: "127.0.0.1" }, () => {
      server.destroy();
      resolve(false);
    });

    server.on("error", () => {
      resolve(true);
    });

    // A connect that neither accepts nor refuses means something is holding
    // the port (e.g. a firewall drop) - treat it as taken rather than wait.
    server.setTimeout(1000, () => {
      server.destroy();
      resolve(false);
    });
  });
}

export async function checkPortStatus(port: number): Promise<"running" | "stopped" | "unknown"> {
  return new Promise((resolve) => {
    const server = createServer();
    const timer = setTimeout(() => {
      server.close();
      resolve("unknown");
    }, 3000);
    server.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      resolve(error.code === "EADDRINUSE" ? "running" : "unknown");
    });
    server.once("listening", () => {
      clearTimeout(timer);
      server.close(() => resolve("stopped"));
    });
    server.listen(port, "127.0.0.1");
  });
}

export async function findAvailablePort(
  basePort: number,
  maxAttempts: number = 10,
): Promise<number | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = basePort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  return null;
}

export function getUsedPorts(resources: DiscoveredResource[]): Set<number> {
  const usedPorts = new Set<number>();
  for (const r of resources) {
    if (r.port && r.port > 0) {
      usedPorts.add(r.port);
    }
  }
  return usedPorts;
}

function findNextAvailablePort(
  usedPorts: Set<number>,
  range: { base: number; min: number; max: number },
): number | null {
  for (let port = range.base; port <= range.max; port++) {
    if (!usedPorts.has(port)) {
      return port;
    }
  }
  return null;
}

export function assignPort(
  resourceType: PortAssignableResourceType,
  existingResources: DiscoveredResource[],
): number {
  const usedPorts = getUsedPorts(existingResources);
  const portRange = PORT_RANGES[resourceType];

  const assignedPort = findNextAvailablePort(usedPorts, portRange);

  if (assignedPort === null) {
    throw new Error(
      `No available ports in range ${portRange.base}-${portRange.max}. ` +
        "Check TILT_RESOURCE_DEFAULTS.star for port configuration.",
    );
  }

  return assignedPort;
}
