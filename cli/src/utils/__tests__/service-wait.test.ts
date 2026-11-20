// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { makeResource } from "../../test-support/index.js";
import type { ServiceRuntimeState } from "../../types/index.js";
import { type ServiceWaitSnapshot, waitForServices } from "../service-wait.js";

function state(status: ServiceRuntimeState["status"], reason?: string): ServiceRuntimeState {
  return reason ? { status, reason } : { status };
}

function snapshots(...values: ServiceWaitSnapshot[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

describe("waitForServices", () => {
  it("returns ready on the first look when every service is healthy", async () => {
    const result = await waitForServices(
      [makeResource("api", "backend"), makeResource("web", "backend")],
      [],
      30,
      {
        snapshot: snapshots({ states: { api: state("ready"), web: state("ready") } }),
      },
    );

    expect(result.state).toBe("ready");
    expect(result.ready).toBe(true);
    expect(result.message).toContain("2 services are healthy");
    expect(result.services).toEqual([
      { name: "api", status: "ready" },
      { name: "web", status: "ready" },
    ]);
    expect(result.unhealthy).toEqual([]);
  });

  it("keeps looking until a starting service becomes ready", async () => {
    const snapshot = vi
      .fn()
      .mockReturnValueOnce({ states: { api: state("pending", "starting") } })
      .mockReturnValueOnce({ states: { api: state("ready") } });
    const sleep = vi.fn(async () => {});
    const result = await waitForServices([makeResource("api", "backend")], ["api"], 30, {
      snapshot,
      sleep,
    });

    expect(result.state).toBe("ready");
    expect(snapshot).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("fails as soon as a service reports a terminal error, naming it with its log tail", async () => {
    const fetchLogTails = vi.fn(async () => [
      { name: "api", lines: ["TypeError: cannot read env"] },
    ]);
    const result = await waitForServices(
      [makeResource("api", "backend"), makeResource("web", "backend")],
      [],
      30,
      {
        snapshot: snapshots({
          states: { api: state("error", "exited repeatedly"), web: state("ready") },
          readiness: {
            ready: false,
            failures: [{ name: "api", message: "exited repeatedly" }],
            pending: 0,
            timedOut: false,
            enabled: ["api", "web"],
          },
        }),
        fetchLogTails,
      },
    );

    expect(result.state).toBe("failed");
    expect(result.ready).toBe(false);
    expect(result.message).toContain("api");
    expect(result.unhealthy).toEqual(["api"]);
    expect(result.failures).toEqual([{ name: "api", message: "exited repeatedly" }]);
    expect(fetchLogTails).toHaveBeenCalledWith(["api"]);
    expect(result.services[0]).toMatchObject({
      name: "api",
      status: "error",
      logs: ["TypeError: cannot read env"],
    });
  });

  it("times out on a service that is still starting, naming it with its log tail", async () => {
    let nowMs = 0;
    const fetchLogTails = vi.fn(async () => [{ name: "api", lines: ["still compiling"] }]);
    const sleep = vi.fn(async () => {
      nowMs += 11_000;
    });
    const result = await waitForServices([makeResource("api", "backend")], ["api"], 10, {
      snapshot: snapshots({ states: { api: state("pending", "starting") } }),
      now: () => nowMs,
      sleep,
      fetchLogTails,
    });

    expect(result.state).toBe("timeout");
    expect(result.ready).toBe(false);
    expect(result.message).toContain("Timed out after 10s");
    expect(result.message).toContain("api");
    expect(result.unhealthy).toEqual(["api"]);
    expect(fetchLogTails).toHaveBeenCalledWith(["api"]);
    expect(result.services[0].logs).toEqual(["still compiling"]);
  });

  it("reports an unknown service name without looking at the stack", async () => {
    const snapshot = vi.fn();
    const result = await waitForServices([makeResource("api", "backend")], ["typo"], 30, {
      snapshot,
    });

    expect(result.state).toBe("unknown-service");
    expect(result.ready).toBe(false);
    expect(result.unknown).toEqual(["typo"]);
    expect(result.message).toContain("typo");
    expect(snapshot).not.toHaveBeenCalled();
  });

  it("waits only for the services that were named", async () => {
    const result = await waitForServices(
      [makeResource("api", "backend"), makeResource("web", "backend")],
      ["web"],
      30,
      {
        snapshot: snapshots({
          states: { api: state("error", "failed"), web: state("ready") },
        }),
      },
    );

    expect(result.state).toBe("ready");
    expect(result.services).toEqual([{ name: "web", status: "ready" }]);
    expect(result.unhealthy).toEqual([]);
  });

  it("treats a settled not-ready readiness answer as a timeout", async () => {
    const result = await waitForServices([makeResource("api", "backend")], [], 30, {
      snapshot: snapshots({
        states: { api: state("pending") },
        readiness: {
          ready: false,
          failures: [],
          pending: 1,
          timedOut: true,
          enabled: ["api"],
        },
        settled: true,
      }),
    });

    expect(result.state).toBe("timeout");
    expect(result.unhealthy).toEqual(["api"]);
  });

  it("does not hide the readiness answer when log lookup fails", async () => {
    const result = await waitForServices([makeResource("api", "backend")], [], 30, {
      snapshot: snapshots({ states: { api: state("error", "crashed") } }),
      fetchLogTails: async () => {
        throw new Error("logs unavailable");
      },
    });

    expect(result.state).toBe("failed");
    expect(result.services[0].logs).toBeUndefined();
  });
});
