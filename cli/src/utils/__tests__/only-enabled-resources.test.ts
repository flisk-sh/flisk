// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { onlyEnabledResources } from "../up-readiness.js";

interface TiltResource {
  metadata: { name: string };
  status: {
    updateStatus: string;
    runtimeStatus: string;
    disableStatus?: { state: string };
  };
}

interface TiltResources {
  items: TiltResource[];
}

const enabledResource = (name: string): TiltResource => ({
  metadata: { name },
  status: { updateStatus: "ok", runtimeStatus: "ok" },
});

const disabledResource = (name: string): TiltResource => ({
  metadata: { name },
  status: {
    updateStatus: "none",
    runtimeStatus: "none",
    disableStatus: { state: "Disabled" },
  },
});

const resourcesJson = (...items: TiltResource[]): string => JSON.stringify({ items });

const filteredResources = (jsonText: string): TiltResources =>
  JSON.parse(onlyEnabledResources(jsonText)) as TiltResources;

describe("onlyEnabledResources", () => {
  it("removes disabled resources and preserves enabled resources in order", () => {
    const input = resourcesJson(
      enabledResource("api"),
      disabledResource("web-run-only"),
      enabledResource("worker"),
      disabledResource("other-phase"),
      enabledResource("frontend"),
    );

    expect(filteredResources(input)).toEqual({
      items: [enabledResource("api"), enabledResource("worker"), enabledResource("frontend")],
    });
  });

  it("keeps all resources in their original order when all are enabled", () => {
    const input = resourcesJson(
      enabledResource("first"),
      enabledResource("second"),
      enabledResource("third"),
    );

    expect(filteredResources(input)).toEqual({
      items: [enabledResource("first"), enabledResource("second"), enabledResource("third")],
    });
  });

  it("returns no resources when all resources are disabled", () => {
    const input = resourcesJson(disabledResource("web"), disabledResource("api"));

    expect(filteredResources(input)).toEqual({ items: [] });
  });

  it("returns an empty collection when Tilt reports no items", () => {
    expect(filteredResources("{}")).toEqual({ items: [] });
  });
});
