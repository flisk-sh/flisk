// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

import { applyEnvAliases } from "../env-compat.js";

describe("applyEnvAliases", () => {
  it("mirrors FLISK_X onto TDK_X", () => {
    const env: NodeJS.ProcessEnv = { FLISK_HTTP_PORT: "8080" };
    expect(applyEnvAliases(env)).toEqual([]);
    expect(env.TDK_HTTP_PORT).toBe("8080");
  });

  it("keeps an explicit TDK_X and reports no deprecation when FLISK_X is also set", () => {
    const env: NodeJS.ProcessEnv = { FLISK_HTTP_PORT: "1", TDK_HTTP_PORT: "2" };
    expect(applyEnvAliases(env)).toEqual([]);
    expect(env.TDK_HTTP_PORT).toBe("2");
  });

  it("reports legacy-only names as deprecated", () => {
    const env: NodeJS.ProcessEnv = { TDK_LICENSE_KEY: "k" };
    expect(applyEnvAliases(env)).toEqual(["TDK_LICENSE_KEY"]);
  });
});
