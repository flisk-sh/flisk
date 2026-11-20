// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { makeResource } from "../../test-support/index.js";
import { reportedCapabilities } from "../capabilities.js";

const containerProject = [
  makeResource("api", "backend"),
  makeResource("web", "frontend", { dependsOn: ["api"] }),
];

const nativeProject = [
  makeResource("api", "backend", { command: "bun run dev" }),
  makeResource("web", "frontend", { command: "bun run dev" }),
];

describe("reportedCapabilities", () => {
  it("reports no capability for a project of local processes", () => {
    // `getEnabledCapabilities` infers gateway and database from resource types and dependsOn, which describe containers;
    // a project of `command` services starts neither, so a report must not claim one (#3873).
    expect(reportedCapabilities(null, nativeProject)).toEqual([]);
  });

  it("keeps the inferred capabilities for a container project", () => {
    expect(reportedCapabilities(null, containerProject).sort()).toEqual(["database", "gateway"]);
  });

  it("keeps them when the caller has no resources to inspect", () => {
    // `flisk doctor` only discovers resources when the project is native; an empty list must not turn a capability off.
    expect(reportedCapabilities(null, []).sort()).toEqual(["database", "gateway"]);
  });
});
