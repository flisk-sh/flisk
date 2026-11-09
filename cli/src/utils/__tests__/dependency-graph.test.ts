// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import type { DiscoveredResource } from "../../types/index.js";
import {
  declaredDependsOn,
  dependencyEdges,
  dependsOnEntryName,
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

describe("dependsOnEntryName", () => {
  it("extracts name from strings and objects, returning null for non-names", () => {
    expect(dependsOnEntryName("db")).toBe("db");
    expect(dependsOnEntryName({ name: "db" })).toBe("db");
    expect(dependsOnEntryName({ name: "db", condition: "service_healthy" })).toBe("db");
    expect(dependsOnEntryName({ name: "" })).toBeNull();
    expect(dependsOnEntryName({ name: 123 })).toBeNull();
    expect(dependsOnEntryName({})).toBeNull();
    expect(dependsOnEntryName(null)).toBeNull();
    expect(dependsOnEntryName(undefined)).toBeNull();
    expect(dependsOnEntryName(123)).toBeNull();
    expect(dependsOnEntryName(true)).toBeNull();
    expect(dependsOnEntryName(false)).toBeNull();
    expect(dependsOnEntryName([])).toBeNull();
    expect(dependsOnEntryName(["db"])).toBeNull();
    const arrayWithName = ["db"] as unknown as Record<string, unknown>;
    arrayWithName.name = "db";
    expect(dependsOnEntryName(arrayWithName)).toBeNull();
    function namedFunction() {}
    expect(dependsOnEntryName(namedFunction)).toBeNull();
    expect(dependsOnEntryName(() => "db")).toBeNull();
  });
});

describe("dependsOnOf", () => {
  it("handles missing config gracefully", () => {
    expect(dependsOnOf(undefined)).toEqual([]);
  });

  it("counts a bring-your-own sidecar's host as a dependency, once", () => {
    expect(
      dependsOnOf({ appType: "bring-your-own", sidecarOf: "tubehaus", dependsOn: ["postgres"] }),
    ).toEqual(["postgres", "tubehaus"]);
    expect(
      dependsOnOf({ appType: "bring-your-own", sidecarOf: "tubehaus", dependsOn: ["tubehaus"] }),
    ).toEqual(["tubehaus"]);
    // Empty sidecarOf should not be counted
    expect(dependsOnOf({ appType: "bring-your-own", sidecarOf: "" })).toEqual([]);
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
    expect(dependsOnOf({ dependencies: ["b", 123] })).toEqual([]);
    expect(dependsOnOf({ dependencies: [123] })).toEqual([]);
  });
});

describe("declaredDependsOn", () => {
  it("handles missing config gracefully", () => {
    expect(declaredDependsOn(undefined)).toEqual([]);
  });

  it("tells a missing dependsOn (none) from a wrong-typed one (null)", () => {
    expect(declaredDependsOn({})).toEqual([]);
    expect(declaredDependsOn({ dependsOn: null })).toBeNull();
    expect(declaredDependsOn({ dependsOn: "api" })).toBeNull();
    expect(declaredDependsOn({ dependsOn: ["valid", 123] })).toBeNull();
    expect(declaredDependsOn({ dependsOn: ["valid", null] })).toBeNull();
    expect(declaredDependsOn({ dependsOn: ["valid", { condition: "no-name" }] })).toBeNull();
  });

  it("reads Compose-style { name, condition } entries by their name", () => {
    expect(
      declaredDependsOn({
        dependsOn: ["cache", { name: "db", condition: "service_healthy" }, { name: "job" }],
      }),
    ).toEqual(["cache", "db", "job"]);
    expect(declaredDependsOn({ dependsOn: [{ condition: "service_healthy" }] })).toBeNull();
    expect(declaredDependsOn({ dependsOn: [{ name: "" }] })).toBeNull();
    expect(declaredDependsOn({ dependsOn: [["db"]] })).toBeNull();
  });

  it("gives the same edges for object entries as for names", () => {
    const edges = dependencyEdges([
      svc("api", { dependsOn: [{ name: "db", condition: "service_healthy" }] }),
      svc("db"),
    ]);
    expect(edges.get("api")).toEqual(["db"]);
    expect(dependsOnOf({ dependsOn: [{ name: "db" }, "cache"] })).toEqual(["db", "cache"]);
  });
});

describe("dependencyEdges", () => {
  it("handles resources with undefined config or without stack", () => {
    expect(edges([{ name: "bare", stack: "s", type: "backend" } as DiscoveredResource])).toEqual({
      bare: [],
    });
    expect(edges([{ name: "ui", stack: "s", type: "frontend" } as DiscoveredResource])).toEqual({
      ui: [],
    });
    const graph = edges([
      { name: "orphan", stack: "", config: {} } as DiscoveredResource,
      { name: "caller", config: { dependsOn: [""] } } as DiscoveredResource,
    ]);
    expect(graph.caller).toEqual([]);
  });

  it("sorts targets alphabetically", () => {
    const graph = edges([
      svc("web", { dependsOn: ["zebra", "apple", "mango"] }),
      svc("zebra"),
      svc("apple"),
      svc("mango"),
    ]);
    expect(graph.web).toEqual(["apple", "mango", "zebra"]);
  });

  it("does not add self-dependency if a frontend sets backendName to its own name", () => {
    const graph = edges([svc("ui", { appType: "frontend", backendName: "ui" })]);
    expect(graph.ui).toEqual([]);
  });

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

  it("handles resources without stacks or with empty stack strings", () => {
    const found = unnamedEntries([
      { name: "orphan", stack: "", config: { dependsOn: [""] } } as DiscoveredResource,
      { name: "bare", stack: undefined, config: { dependsOn: ["ghost"] } } as DiscoveredResource,
    ]);
    expect(found).toEqual([
      { resource: "orphan", name: "" },
      { resource: "bare", name: "ghost" },
    ]);
  });
});

describe("unknownBackendNames", () => {
  it("handles resources with undefined config", () => {
    expect(unknownBackendNames([{ name: "bare" } as DiscoveredResource])).toEqual([]);
    expect(unknownBackendNames([{ name: "ui", type: "frontend" } as DiscoveredResource])).toEqual(
      [],
    );
  });

  it("ignores non-string backendName values", () => {
    expect(
      unknownBackendNames([
        svc("ui1", { appType: "frontend", backendName: 123 }),
        svc("ui2", { appType: "frontend", backendName: true }),
        svc("ui3", { appType: "frontend", backendName: { name: "api" } }),
      ]),
    ).toEqual([]);
  });

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
