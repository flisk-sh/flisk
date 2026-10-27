// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { DEFAULT_ALWAYS_ENABLED_INFRA } from "../project-config-defaults.js";

describe("DEFAULT_ALWAYS_ENABLED_INFRA", () => {
  it("matches the exact list and order of default always-enabled infrastructure services", () => {
    // This list is intentionally pinned; update the expected entries when the default infrastructure contract deliberately changes.
    expect(DEFAULT_ALWAYS_ENABLED_INFRA).toEqual(["database-management", "proxy"]);
  });
});
