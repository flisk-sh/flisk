// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoveredResource } from "../../types/index.js";
import { DEVCONTAINER_DOCKER_FIX } from "../../utils/agent-host.js";
import { defaultDockerReachable, driftReport, hostUpRefusal, waitForTiltUi } from "../up.js";

const { execFileMock, connectMock, verifyMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  connectMock: vi.fn(),
  verifyMock: vi.fn(),
}));

vi.mock("../../generator/template-engine.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../generator/template-engine.js")>();
  return { ...actual, verifyMasterConfigs: verifyMock };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFile: execFileMock,
  };
});

vi.mock("node:net", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:net")>();
  return {
    ...actual,
    connect: connectMock,
  };
});

class MockSocket extends EventEmitter {
  destroyed = false;
  destroy(): this {
    this.destroyed = true;
    return this;
  }
}

describe("up-command Docker and Tilt startup helpers", () => {
  beforeEach(() => {
    execFileMock.mockReset();
    connectMock.mockReset();
    verifyMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("defaultDockerReachable", () => {
    describe("Scenario A — Docker reachable", () => {
      it("returns true when docker ps command succeeds without error", async () => {
        execFileMock.mockImplementation((cmd, args, opts, cb) => {
          expect(cmd).toBe("docker");
          expect(args).toEqual(["ps"]);
          expect(opts).toEqual({ timeout: 10_000 });
          cb(null, "CONTAINER ID   IMAGE   COMMAND   CREATED   STATUS   PORTS   NAMES\n", "");
        });

        const reachable = await defaultDockerReachable();
        expect(reachable).toBe(true);
      });

      it("permits hostUpRefusal to proceed when container host Docker probe succeeds", async () => {
        execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
          cb(null, "", "");
        });

        const refusal = await hostUpRefusal(
          { kind: "devcontainer", canUp: true },
          defaultDockerReachable,
        );
        expect(refusal).toBeNull();
      });
    });

    describe("Scenario B — Docker unavailable", () => {
      it("returns false when docker ps execution fails with an error", async () => {
        execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
          const error = new Error(
            "Cannot connect to the Docker daemon at unix:///var/run/docker.sock.",
          );
          cb(error, "", "daemon not running");
        });

        const reachable = await defaultDockerReachable();
        expect(reachable).toBe(false);
      });

      it("returns false when docker ps times out", async () => {
        execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
          const error = Object.assign(new Error("Command timed out"), { killed: true });
          cb(error, "", "");
        });

        const reachable = await defaultDockerReachable();
        expect(reachable).toBe(false);
      });

      it("triggers DEVCONTAINER_DOCKER_FIX refusal when container host Docker probe fails", async () => {
        execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
          cb(new Error("docker down"), "", "");
        });

        const refusal = await hostUpRefusal(
          { kind: "devcontainer", canUp: true },
          defaultDockerReachable,
        );
        expect(refusal).toBe(DEVCONTAINER_DOCKER_FIX);
      });
    });
  });

  describe("waitForTiltUi", () => {
    describe("Scenario C — Tilt UI becomes available", () => {
      it("resolves true immediately when Tilt UI port connects on first attempt", async () => {
        connectMock.mockImplementation(({ host, port }) => {
          expect(host).toBe("127.0.0.1");
          expect(port).toBe(10350);
          const socket = new MockSocket();
          queueMicrotask(() => socket.emit("connect"));
          return socket;
        });

        const result = await waitForTiltUi(10350);
        expect(result).toBe(true);
      });

      it("resolves true after initial connection failures once Tilt UI responds", async () => {
        vi.useFakeTimers();

        let attempt = 0;
        connectMock.mockImplementation(() => {
          attempt++;
          const socket = new MockSocket();
          queueMicrotask(() => {
            if (attempt < 3) {
              socket.emit("error", new Error("ECONNREFUSED"));
            } else {
              socket.emit("connect");
            }
          });
          return socket;
        });

        const waitPromise = waitForTiltUi(10350, 5000);

        // Advance through retries (250ms per retry)
        await vi.advanceTimersByTimeAsync(250);
        await vi.advanceTimersByTimeAsync(250);

        const result = await waitPromise;
        expect(result).toBe(true);
        expect(attempt).toBe(3);
      });
    });

    describe("Scenario D — Tilt UI never responds", () => {
      it("resolves false when virtual time reaches documented timeout", async () => {
        vi.useFakeTimers();

        connectMock.mockImplementation(() => {
          const socket = new MockSocket();
          queueMicrotask(() => socket.emit("error", new Error("ECONNREFUSED")));
          return socket;
        });

        const timeoutMs = 1000;
        const waitPromise = waitForTiltUi(10350, timeoutMs);

        // Advance virtual time beyond the timeout
        await vi.advanceTimersByTimeAsync(timeoutMs + 250);

        const result = await waitPromise;
        expect(result).toBe(false);
      });
    });
  });

  describe("driftReport with resources", () => {
    const resources: DiscoveredResource[] = [
      {
        name: "web",
        path: "/project/services/web",
        configPath: "/project/services/web/service.json",
        config: { appName: "web", appType: "frontend" },
      },
    ];

    it("verifies only the discovered manifests and skips manifest validation", () => {
      verifyMock.mockReturnValue({ handEdited: [] });

      expect(driftReport("/project", resources)).toBeNull();
      expect(verifyMock).toHaveBeenCalledWith("/project", {
        manifestPaths: ["/project/services/web/service.json"],
        skipManifestValidation: true,
      });
    });

    it("reports hand-edited generated files", () => {
      verifyMock.mockReturnValue({ handEdited: ["services/web/Dockerfile"] });

      const report = driftReport("/project", resources);
      expect(report).toContain("  services/web/Dockerfile");
      expect(report?.[0]).toMatch(/edited by hand/);
    });

    it("verifies without options when no resources are given", () => {
      verifyMock.mockReturnValue({ handEdited: [] });

      driftReport("/project");
      expect(verifyMock).toHaveBeenCalledWith("/project", undefined);
    });
  });
});
