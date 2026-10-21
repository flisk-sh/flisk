// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import type { DiscoveredResource } from "../../types/index.js";
import { projectNeedsBun } from "../bun-requirement.js";

function resource(appType: string | undefined): DiscoveredResource {
  return { name: "svc", configPath: "/x/service.json", config: { appType } } as DiscoveredResource;
}

describe("projectNeedsBun", () => {
  it("needs Bun for a JS API, frontend or worker service", () => {
    expect(projectNeedsBun([resource("frontend")])).toBe(true);
    expect(projectNeedsBun([resource("worker")])).toBe(true);
  });

  it("does not need Bun when there are no services", () => {
    expect(projectNeedsBun([])).toBe(false);
  });

  it("does not need Bun for a project with only non-JS services", () => {
    expect(projectNeedsBun([resource("database")])).toBe(false);
  });
});
