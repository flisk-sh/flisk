// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import type { DiscoveredResource } from "../../types/index.js";
import { findUnknownServices, resolveOnlySelection } from "../up-only.js";

const svc = (name: string, dependsOn: string[] = [], stack = "store"): DiscoveredResource =>
  ({
    name,
    stack,
    path: "",
    configPath: "",
    config: { appName: name, appType: "backend", dependsOn },
  }) as never;

const all = [
  svc("catalog-api"),
  svc("storefront-web", ["catalog-api"]),
  svc("orders-api", ["catalog-api", "ghost"], "sales"),
  svc("jobs"),
];

describe("resolveOnlySelection", () => {
  it("adds the dependsOn closure and reports what was pulled in", () => {
    const { selected, dependencies } = resolveOnlySelection(["storefront-web"], all);
    expect(selected.map((r) => r.name)).toEqual(["catalog-api", "storefront-web"]);
    expect(dependencies).toEqual(["catalog-api"]);
  });
  it("does not pull in dependents", () => {
    expect(resolveOnlySelection(["catalog-api"], all).selected.map((r) => r.name)).toEqual([
      "catalog-api",
    ]);
  });
  it("follows dependencies across stacks and ignores entries that are not services", () => {
    const { selected } = resolveOnlySelection(["orders-api"], all);
    expect(selected.map((r) => r.name)).toEqual(["catalog-api", "orders-api"]);
  });
  it("survives dependency cycles", () => {
    const cyc = [svc("a", ["b"]), svc("b", ["a"])];
    expect(resolveOnlySelection(["a"], cyc).selected.map((r) => r.name)).toEqual(["a", "b"]);
  });
  it("does not list a requested service as a dependency", () => {
    expect(resolveOnlySelection(["catalog-api", "storefront-web"], all).dependencies).toEqual([]);
  });
});

describe("resolveOnlySelection vs the Tiltfile", () => {
  it("is only the service.json dependsOn closure; the Tiltfile may skip some of it", () => {
    // The Tiltfile drops a transitive dependency whose name contains "frontend" (profiles.star, resolve_dependency),
    // so `flisk up --only` reports what Tilt enabled once it is ready, and this closure only as `declaredDependencies`.
    const withFrontendDep = [svc("api", ["admin-frontend"]), svc("admin-frontend")];
    expect(resolveOnlySelection(["api"], withFrontendDep).dependencies).toEqual(["admin-frontend"]);
  });
});

describe("findUnknownServices", () => {
  it("returns names that match no service", () => {
    expect(findUnknownServices(["catalog-api", "nope"], all)).toEqual(["nope"]);
  });
});
