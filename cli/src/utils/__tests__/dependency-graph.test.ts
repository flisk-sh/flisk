// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import type { DiscoveredResource } from "../../types/index.js";
import {
  declaredDependsOn,
  dependencyEdges,
  dependsOnOf,
  unknownBackendNames,
  unnamedEntries,
} from "../dependency-graph.js";

const svc = (
  name: string,
  config: Record<string, unknown> = {},
  stack = "shop",
): DiscoveredResource =>
  ({
    name,
    stack,
    path: "",
    configPath: "",
    config: { appName: name, appType: "backend", ...config },
  }) as never;

const edges = (resources: DiscoveredResource[]) => Object.fromEntries(dependencyEdges(resources));

describe("dependsOnOf", () => {
  it("counts a bring-your-own sidecar's host as a dependency, once", () => {
    expect(
      dependsOnOf({ appType: "bring-your-own", sidecarOf: "tubehaus", dependsOn: ["postgres"] }),
    ).toEqual(["postgres", "tubehaus"]);
    expect(
      dependsOnOf({ appType: "bring-your-own", sidecarOf: "tubehaus", dependsOn: ["tubehaus"] }),
    ).toEqual(["tubehaus"]);
    // Only bring-your-own resources have sidecars; config verify reports sidecarOf elsewhere.
    expect(dependsOnOf({ appType: "backend", sidecarOf: "tubehaus" })).toEqual([]);
  });

  it("reads a list of names", () => {
    expect(dependsOnOf({ dependsOn: ["a", "b"] })).toEqual(["a", "b"]);
  });
  it("reads nothing from a value that is not a list of strings", () => {
    for (const value of ["orders", null, 7, { orders: true }, [1], [["a"]]]) {
      expect(dependsOnOf({ dependsOn: value })).toEqual([]);
    }
  });
  it("counts the deprecated dependencies key with dependsOn, once each", () => {
    expect(dependsOnOf({ dependsOn: ["a"], dependencies: ["b", "a"] })).toEqual(["a", "b"]);
  });
  it("ignores a deprecated key that is not a list of strings", () => {
    expect(dependsOnOf({ dependsOn: ["a"], dependencies: "b" })).toEqual(["a"]);
  });
});

describe("declaredDependsOn", () => {
  it("tells a missing dependsOn (none) from a wrong-typed one (null)", () => {
    expect(declaredDependsOn({})).toEqual([]);
    expect(declaredDependsOn({ dependsOn: null })).toBeNull();
    expect(declaredDependsOn({ dependsOn: "api" })).toBeNull();
  });
});

describe("dependencyEdges", () => {
  it("follows service names and ignores names that are not services", () => {
    const graph = edges([svc("api"), svc("web", { dependsOn: ["api", "ghost", "postgres"] })]);
    expect(graph).toEqual({ api: [], web: ["api"] });
  });
  it("makes a stack name mean the stack's other services", () => {
    const graph = edges([
      svc("a", {}, "core"),
      svc("b", {}, "core"),
      svc("c", { dependsOn: ["core"] }, "edge"),
      svc("d", { dependsOn: ["core"] }, "core"),
    ]);
    expect(graph.c).toEqual(["a", "b", "d"]);
    expect(graph.d).toEqual(["a", "b"]);
  });
  it("leaves a stack's frontends out, as --focus does", () => {
    const graph = edges([
      svc("api", {}, "core"),
      svc("ui", { appType: "frontend", backendName: "api" }, "core"),
      svc("worker", { dependsOn: ["core"] }, "edge"),
    ]);
    expect(graph.worker).toEqual(["api"]);
  });
  it("makes a frontend wait for its backendName, in any stack", () => {
    const graph = edges([
      svc("api", {}, "back"),
      svc("ui", { appType: "frontend", backendName: "api", dependsOn: [] }, "front"),
    ]);
    expect(graph.ui).toEqual(["api"]);
  });
  it("does not give a backend a backendName edge", () => {
    expect(edges([svc("a"), svc("b", { backendName: "a" })]).b).toEqual([]);
  });
  it("keeps a self entry so the cycle check can report it", () => {
    expect(edges([svc("a", { dependsOn: ["a"] })]).a).toEqual(["a"]);
  });
  it("gives a wrong-typed dependsOn no edges", () => {
    expect(edges([svc("a"), svc("b", { dependsOn: "a" })]).b).toEqual([]);
  });
  it("reads the deprecated dependencies key", () => {
    expect(edges([svc("a"), svc("b", { dependencies: ["a"] })]).b).toEqual(["a"]);
  });
});

describe("unnamedEntries", () => {
  it("lists entries that are no service, stack or known infra name", () => {
    const found = unnamedEntries(
      [svc("api"), svc("web", { dependsOn: ["api", "shop", "ghost", "postgres"] })],
      new Set(["postgres"]),
    );
    expect(found).toEqual([{ resource: "web", name: "ghost" }]);
  });
});

describe("unknownBackendNames", () => {
  it("lists a frontend whose backendName is no service", () => {
    const found = unknownBackendNames([
      svc("api"),
      svc("ui", { appType: "frontend", backendName: "api" }),
      svc("lost", { appType: "frontend", backendName: "ghost" }),
      svc("plain", { appType: "frontend" }),
      svc("back", { backendName: "ghost" }),
    ]);
    expect(found).toEqual([{ resource: "lost", name: "ghost" }]);
  });
});
