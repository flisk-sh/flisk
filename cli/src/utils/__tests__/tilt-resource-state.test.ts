// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  effectiveRuntimeStatus,
  isNeverStarted,
  isTiltResourcePending,
} from "../tilt-resource-state.js";

describe("isTiltResourcePending", () => {
  it.each([
    ["pending", "pending"],
    ["none", "none"],
    ["in_progress", "not_applicable"],
    ["ok", "pending"],
    ["ok", "none"],
    ["error", "pending"],
    ["in_progress", "ok"],
    // Just registered by Tilt: no status reported yet (the next-postgres journey read this as ready and ran NP2 too early).
    ["", ""],
  ])("treats update=%s runtime=%s as not ready yet", (update, runtime) => {
    expect(isTiltResourcePending(update, runtime)).toBe(true);
  });

  it.each([
    ["ok", "ok"],
    ["ok", "not_applicable"],
    ["error", "ok"],
  ])("does not treat update=%s runtime=%s as pending", (update, runtime) => {
    expect(isTiltResourcePending(update, runtime)).toBe(false);
  });
});

describe("isNeverStarted", () => {
  // Shape of a redis resource with auto_init=False: Tilt lists it with both statuses none and nothing queued or deployed.
  it("treats a resource never built or deployed as not waiting on anything", () => {
    expect(
      isNeverStarted({
        updateStatus: "none",
        runtimeStatus: "none",
        lastDeployTime: null,
        pendingBuildSince: null,
      }),
    ).toBe(true);
  });

  it("keeps a resource with a queued build pending", () => {
    expect(
      isNeverStarted({
        updateStatus: "none",
        runtimeStatus: "none",
        lastDeployTime: null,
        pendingBuildSince: "2026-11-02T07:41:50Z",
      }),
    ).toBe(false);
  });

  it("keeps a resource that has deployed before pending", () => {
    expect(
      isNeverStarted({
        updateStatus: "none",
        runtimeStatus: "none",
        lastDeployTime: "2026-11-02T07:41:50Z",
        pendingBuildSince: null,
      }),
    ).toBe(false);
  });
});

// Shape seen from Tilt 0.37.7: a compose container whose health check always fails is `runtimeStatus: ok` with
// `composeResourceInfo.healthStatus: unhealthy`, and one inside its start period is `ok` with `starting`.
describe("effectiveRuntimeStatus", () => {
  const status = (runtimeStatus: string, healthStatus?: string) => ({
    runtimeStatus,
    ...(healthStatus ? { composeResourceInfo: { healthStatus } } : {}),
  });

  it("treats a running container with a failing health check as an error", () => {
    expect(effectiveRuntimeStatus(status("ok", "unhealthy"))).toBe("error");
  });
  it("treats a running container whose health check has not passed yet as pending", () => {
    expect(effectiveRuntimeStatus(status("ok", "starting"))).toBe("pending");
  });
  it.each([
    [status("ok", "healthy"), "ok"],
    [status("ok"), "ok"],
    [status("pending", "unhealthy"), "pending"],
    [status("error", "healthy"), "error"],
    [undefined, ""],
    [{}, ""],
    [{ composeResourceInfo: { healthStatus: "unhealthy" } }, ""],
  ])("otherwise keeps Tilt's status (%j -> %s)", (input, expected) => {
    expect(effectiveRuntimeStatus(input)).toBe(expected);
  });
});
