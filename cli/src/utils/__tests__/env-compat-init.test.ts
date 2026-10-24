// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";

describe("env-compat-init", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("warns once about TDK_-only variables", async () => {
    vi.stubEnv("TDK_COMPAT_PROBE", "1");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await import("../env-compat-init.js");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("TDK_COMPAT_PROBE"));
  });

  it("stays silent when FLISK_QUIET_DEPRECATIONS is set", async () => {
    vi.stubEnv("TDK_COMPAT_PROBE", "1");
    vi.stubEnv("FLISK_QUIET_DEPRECATIONS", "1");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await import("../env-compat-init.js");
    expect(error).not.toHaveBeenCalled();
  });
});
