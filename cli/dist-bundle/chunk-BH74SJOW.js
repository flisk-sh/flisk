import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  FliskError,
  PORT_RANGES
} from "./chunk-73W4Y4TI.js";

// dist/utils/port-assignment.js
import { createConnection, createServer } from "node:net";
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createConnection({ port, host: "127.0.0.1" }, () => {
      server.destroy();
      resolve(false);
    });
    server.on("error", () => {
      resolve(true);
    });
    server.setTimeout(1e3, () => {
      server.destroy();
      resolve(false);
    });
  });
}
async function checkPortStatus(port) {
  return new Promise((resolve) => {
    const server = createServer();
    const timer = setTimeout(() => {
      server.close();
      resolve("unknown");
    }, 3e3);
    server.once("error", (error) => {
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
async function findAvailablePort(basePort, maxAttempts = 10, claim) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = basePort + i;
    if (await isPortAvailable(port) && (claim?.(port) ?? true)) {
      return port;
    }
  }
  return null;
}
function getUsedPorts(resources) {
  const usedPorts = /* @__PURE__ */ new Set();
  for (const r of resources) {
    if (r.port && r.port > 0) {
      usedPorts.add(r.port);
    }
  }
  return usedPorts;
}
function findNextAvailablePort(usedPorts, range) {
  for (let port = range.base; port <= range.max; port++) {
    if (!usedPorts.has(port)) {
      return port;
    }
  }
  return null;
}
function assignPort(resourceType, existingResources) {
  const usedPorts = getUsedPorts(existingResources);
  const portRange = PORT_RANGES[resourceType];
  const assignedPort = findNextAvailablePort(usedPorts, portRange);
  if (assignedPort === null) {
    throw new FliskError(`No available ports in range ${portRange.base}-${portRange.max}. Check TILT_RESOURCE_DEFAULTS.star for port configuration.`, [
      "See which ports are assigned with: flisk resources",
      "Remove a resource you no longer use, or set a free port with --port"
    ]);
  }
  return assignedPort;
}

export {
  checkPortStatus,
  findAvailablePort,
  assignPort
};
