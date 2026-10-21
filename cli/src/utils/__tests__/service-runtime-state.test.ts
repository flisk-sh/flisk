// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { deriveServiceStates } from "../service-runtime-state.js";

function item(name: string, update: string, runtime: string, extra: object = {}) {
  return { metadata: { name }, status: { updateStatus: update, runtimeStatus: runtime, ...extra } };
}
const json = (...items: object[]) => JSON.stringify({ items });
const deps = { api: ["postgres"], web: ["api"] };

describe("deriveServiceStates", () => {
  it("does not call an api ready when its running process has a failed database", () => {
    const states = deriveServiceStates(
      json(item("postgres", "error", "none"), item("api", "ok", "ok")),
      deps,
    );
    expect(states.postgres).toMatchObject({ status: "error" });
    expect(states.api).toEqual({
      status: "error",
      reason: "postgres failed",
      blockedBy: ["postgres"],
    });
  });

  it("blocks a service that reaches the failure through another service", () => {
    const states = deriveServiceStates(
      json(item("postgres", "error", "none"), item("api", "ok", "ok"), item("web", "ok", "ok")),
      deps,
    );
    expect(states.web).toMatchObject({ status: "error", blockedBy: ["postgres"] });
  });

  it("marks a service blocked by a failure even while it is still pending", () => {
    const states = deriveServiceStates(
      json(item("postgres", "error", "none"), item("api", "pending", "pending")),
      deps,
    );
    expect(states.api).toMatchObject({ status: "error", blockedBy: ["postgres"] });
  });

  it("keeps a ready service pending while its dependency is still building", () => {
    const states = deriveServiceStates(
      json(item("postgres", "in_progress", "not_applicable"), item("api", "ok", "ok")),
      deps,
    );
    expect(states.postgres).toEqual({ status: "pending" });
    expect(states.api).toEqual({ status: "pending", reason: "waiting for postgres" });
  });

  it("shows a running api as waiting while its database health check has not passed", () => {
    const states = deriveServiceStates(
      json(
        item("postgres", "ok", "ok", { composeResourceInfo: { healthStatus: "starting" } }),
        item("api", "ok", "ok"),
      ),
      deps,
    );
    expect(states.postgres).toEqual({ status: "pending" });
    expect(states.api).toEqual({ status: "pending", reason: "waiting for postgres" });
  });

  it("reports an unhealthy database as failed and the api as blocked by it", () => {
    const states = deriveServiceStates(
      json(
        item("postgres", "ok", "ok", { composeResourceInfo: { healthStatus: "unhealthy" } }),
        item("api", "ok", "ok"),
      ),
      deps,
    );
    expect(states.postgres).toEqual({
      status: "error",
      reason: "container is running, but its health check is failing",
    });
    expect(states.api).toEqual({
      status: "error",
      reason: "postgres failed",
      blockedBy: ["postgres"],
    });
  });

  it("reports everything ready when everything is", () => {
    const states = deriveServiceStates(
      json(item("postgres", "ok", "ok"), item("api", "ok", "ok"), item("web", "ok", "ok")),
      deps,
    );
    expect(states).toEqual({
      postgres: { status: "ready" },
      api: { status: "ready" },
      web: { status: "ready" },
    });
  });

  it("shows an idle deferred service as unknown and does not let it block its dependents", () => {
    const states = deriveServiceStates(
      json(item("idle", "none", "none"), item("api", "ok", "ok")),
      { api: ["idle"] },
      new Set(["idle"]),
    );
    expect(states.idle).toMatchObject({ status: "unknown" });
    expect(states.api).toEqual({ status: "ready" });
  });

  it("leaves out the Tiltfile, disabled resources and services Tilt does not list", () => {
    const states = deriveServiceStates(
      json(
        item("(Tiltfile)", "ok", "not_applicable"),
        item("other-phase", "none", "none", { disableStatus: { state: "Disabled" } }),
        item("api", "ok", "ok"),
      ),
      { api: ["not-in-tilt"] },
    );
    expect(Object.keys(states)).toEqual(["api"]);
    expect(states.api).toEqual({ status: "ready" });
  });
});
