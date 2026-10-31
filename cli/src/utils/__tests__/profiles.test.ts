// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { makeResource } from "../../test-support/index.js";
import { applyProfiles, declaredProfiles, describeSkipped, profilesOf } from "../profiles.js";
import { validateServiceManifest } from "../service-manifest.js";

const api = makeResource("api", "backend");
const admin = makeResource("admin-ui", "frontend", { profiles: ["admin"] });
const temporal = makeResource("temporal", "bring-your-own", { profiles: ["workflow", "full"] });

describe("opt-in profiles (#2873)", () => {
  it("leaves out services in profiles nobody asked for", () => {
    const { kept, skipped } = applyProfiles([api, admin, temporal]);
    expect(kept.map((r) => r.name)).toEqual(["api"]);
    expect(skipped).toEqual([
      { name: "admin-ui", profiles: ["admin"] },
      { name: "temporal", profiles: ["workflow", "full"] },
    ]);
    expect(describeSkipped(skipped)).toBe(
      "admin-ui (profile admin), temporal (profiles workflow, full)",
    );
  });

  it("starts a service when one of its profiles is active, or when it is named with --only", () => {
    expect(applyProfiles([api, admin, temporal], ["full"]).kept.map((r) => r.name)).toEqual([
      "api",
      "temporal",
    ]);
    expect(applyProfiles([api, admin, temporal], [], ["admin-ui"]).kept.map((r) => r.name)).toEqual(
      ["api", "admin-ui"],
    );
  });

  it("lists the profiles a project declares, and ignores a malformed value", () => {
    expect(declaredProfiles([api, admin, temporal])).toEqual(["admin", "full", "workflow"]);
    expect(profilesOf(makeResource("x", "backend", { profiles: "admin" }))).toEqual([]);
  });

  it("is refused by config verify when it is not a list of profile names", () => {
    const base = { schemaVersion: 1, appName: "x", appType: "backend", stack: "s", port: 4000 };
    expect(validateServiceManifest({ ...base, profiles: ["admin"] }, "x").errors).toEqual([]);
    for (const profiles of ["admin", [], ["Admin"], [1]]) {
      expect(validateServiceManifest({ ...base, profiles }, "x").errors).toContain(
        'x.profiles: expected a list of profile names such as ["admin"] (lowercase letters, digits and hyphens)',
      );
    }
  });
});
