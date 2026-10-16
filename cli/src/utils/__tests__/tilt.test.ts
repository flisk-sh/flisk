// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock findProjectRoot to return a controlled path for all tests
vi.mock("../paths.js", () => ({
  findProjectRoot: vi.fn(),
  getPackageVersion: vi.fn(() => "1.1.0"),
}));

import { findProjectRoot } from "../paths.js";

describe("getTiltfilePath", () => {
  beforeEach(() => {
    vi.mocked(findProjectRoot).mockReturnValue("/fake/project");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return correct tiltfile path for valid project", async () => {
    const { getTiltfilePath } = await import("../tilt.js");
    const tiltfilePath = getTiltfilePath();
    expect(tiltfilePath).toBe(join("/fake/project", ".tdk", ".tdk-out", "Tiltfile"));
  });

  it("should not have double slashes in path", async () => {
    const { getTiltfilePath } = await import("../tilt.js");
    // Ensure root doesn't have trailing slash
    const tiltfilePath = getTiltfilePath();
    expect(tiltfilePath).not.toContain("//");
  });
});

describe("getTiltfilePath error", () => {
  beforeEach(() => {
    vi.mocked(findProjectRoot).mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should throw the shared not-in-project error with suggestions", async () => {
    const { getTiltfilePath } = await import("../tilt.js");
    let error: unknown;
    try {
      getTiltfilePath();
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "Could not find project root (no .tdk/project.json found)",
    );
    expect((error as { suggestions: string[] }).suggestions).toEqual([
      "Run this from within a TDK project",
      "Run `tdk project --yes` to initialize a new project",
    ]);
  });
});

describe("buildTiltUpArgs", () => {
  beforeEach(() => {
    vi.mocked(findProjectRoot).mockReturnValue("/fake/project");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should include -f flag with tiltfile path", async () => {
    const { buildTiltUpArgs } = await import("../tilt.js");
    const args = buildTiltUpArgs(["service-a", "service-b"], {});
    expect(args).toContain("-f");
    const fIndex = args.indexOf("-f");
    expect(fIndex).toBeGreaterThanOrEqual(0);
    expect(args[fIndex + 1]).toContain(join(".tdk", ".tdk-out", "Tiltfile"));
  });

  it("should include service names in order", async () => {
    const { buildTiltUpArgs } = await import("../tilt.js");
    const args = buildTiltUpArgs(["service-a", "service-b"], {});
    expect(args).toContain("service-a");
    expect(args).toContain("service-b");
  });

  it("should include --verbose flag when verbose is set", async () => {
    const { buildTiltUpArgs } = await import("../tilt.js");
    const args = buildTiltUpArgs([], { verbose: true });
    expect(args).toContain("--verbose");
  });

  it("should NOT include --verbose when quiet is set even if verbose is true", async () => {
    const { buildTiltUpArgs } = await import("../tilt.js");
    const args = buildTiltUpArgs([], { verbose: true, quiet: true });
    expect(args).not.toContain("--verbose");
  });

  it("should include --watch flag when watch is set", async () => {
    const { buildTiltUpArgs } = await import("../tilt.js");
    const args = buildTiltUpArgs([], { watch: true });
    expect(args).toContain("--watch");
  });

  it("should order args: -f, tiltfile, services, options", async () => {
    const { buildTiltUpArgs } = await import("../tilt.js");
    const args = buildTiltUpArgs(["svc-a", "svc-b"], { verbose: true });
    expect(args[0]).toBe("-f");
    expect(args[1]).toContain("Tiltfile");
    expect(args[2]).toBe("svc-a");
    expect(args[3]).toBe("svc-b");
    expect(args[4]).toBe("--verbose");
  });

  it("should call findProjectRoot once", async () => {
    const { buildTiltUpArgs } = await import("../tilt.js");
    buildTiltUpArgs([], {});
    expect(findProjectRoot).toHaveBeenCalledTimes(1);
  });

  it("should include -- --focus=<stack> before service names when focusTargets is set", async () => {
    // Regression test: `tdk up <stack>` used to pass only bare positional service
    // names, which the generated Tiltfile's focus filter never reads (it only reads
    // --focus), so it silently fell back to building every stack instead of the one
    // requested. --focus must be present, carry the stack name, and be preceded by
    // `--` (tilt up rejects "--focus" as an unrecognized top-level flag otherwise -
    // `--` is what routes it to the Tiltfile's own config.parse()).
    const { buildTiltUpArgs } = await import("../tilt.js");
    const args = buildTiltUpArgs(["finance-api", "finance-app"], { focusTargets: ["finance"] });
    const dashDashIndex = args.indexOf("--");
    expect(dashDashIndex).toBeGreaterThanOrEqual(0);
    expect(args[dashDashIndex + 1]).toBe("--focus=finance");
    expect(args.indexOf("--focus=finance")).toBeLessThan(args.indexOf("finance-api"));
  });

  it("should join multiple focusTargets with commas in a single --focus flag", async () => {
    const { buildTiltUpArgs } = await import("../tilt.js");
    const args = buildTiltUpArgs([], { focusTargets: ["finance", "hr"] });
    expect(args).toContain("--focus=finance,hr");
  });

  it("should NOT include --focus when focusTargets is empty or omitted", async () => {
    const { buildTiltUpArgs } = await import("../tilt.js");
    const withEmpty = buildTiltUpArgs(["svc"], { focusTargets: [] });
    const withOmitted = buildTiltUpArgs(["svc"], {});
    expect(withEmpty.some((a) => a.startsWith("--focus"))).toBe(false);
    expect(withOmitted.some((a) => a.startsWith("--focus"))).toBe(false);
  });
});

describe("buildTiltDownArgs", () => {
  beforeEach(() => {
    vi.mocked(findProjectRoot).mockReturnValue("/fake/project");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should include -f flag with tiltfile path", async () => {
    const { buildTiltDownArgs } = await import("../tilt.js");
    const args = buildTiltDownArgs({});
    expect(args).toContain("-f");
  });

  it("should not pass --force to tilt down even when force is set", async () => {
    // Regression test for issue #1216: tilt down has no --force flag and fails
    // with "unknown flag: --force" if passed.
    const { buildTiltDownArgs } = await import("../tilt.js");
    const argsWithForce = buildTiltDownArgs({ force: true });
    const argsWithoutForce = buildTiltDownArgs({});
    expect(argsWithForce).not.toContain("--force");
    expect(argsWithoutForce).not.toContain("--force");
  });

  it("passes every stack to the Tiltfile after -- so tilt down registers stack compose projects", async () => {
    const { buildTiltDownArgs } = await import("../tilt.js");
    const args = buildTiltDownArgs({ focusTargets: ["shop", "billing"] });
    expect(args.slice(-2)).toEqual(["--", "--focus=shop,billing"]);
  });

  it("adds no Tiltfile arguments when there are no stacks", async () => {
    const { buildTiltDownArgs } = await import("../tilt.js");
    expect(buildTiltDownArgs({ focusTargets: [] })).not.toContain("--");
  });
});

describe("isTiltAvailable", () => {
  it("should return a boolean", async () => {
    const { isTiltAvailable } = await import("../tilt.js");
    const available = await isTiltAvailable();
    expect(typeof available).toBe("boolean");
  });
});
