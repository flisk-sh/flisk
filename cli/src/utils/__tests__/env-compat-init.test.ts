// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { createTempProject, parseEnvelope, runFlisk } from "../../test-support/index.js";

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

  it("stays silent when --json is in process.argv", async () => {
    vi.stubEnv("TDK_COMPAT_PROBE", "1");
    const originalArgv = process.argv;
    process.argv = [...originalArgv, "--json"];
    try {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      await import("../env-compat-init.js");
      expect(error).not.toHaveBeenCalled();
    } finally {
      process.argv = originalArgv;
    }
  });

  it("stays silent when --json-legacy is in process.argv", async () => {
    vi.stubEnv("TDK_COMPAT_PROBE", "1");
    const originalArgv = process.argv;
    process.argv = [...originalArgv, "--json-legacy"];
    try {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      await import("../env-compat-init.js");
      expect(error).not.toHaveBeenCalled();
    } finally {
      process.argv = originalArgv;
    }
  });

  it("keeps stderr empty when a legacy TDK_ variable is set on a --json command", () => {
    const cwd = createTempProject({
      stacks: { api: { gateway: { appType: "backend", port: 3100 } } },
    });
    const result = runFlisk(["stacks", "--json"], {
      cwd,
      env: { TDK_EXTENSION_PATH: "/tmp/custom-extension" },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseEnvelope(result.stdout)).toMatchObject({
      schemaVersion: 1,
      data: { stacks: [{ name: "api", resourceCount: 1 }] },
      errors: [],
    });
  });

  it("preserves the deprecation warning on stderr for human-readable commands", () => {
    const cwd = createTempProject({
      stacks: { api: { gateway: { appType: "backend", port: 3100 } } },
    });
    const result = runFlisk(["stacks"], {
      cwd,
      env: { TDK_EXTENSION_PATH: "/tmp/custom-extension" },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("flisk: TDK_EXTENSION_PATH is deprecated");
  });
});
