// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { MISSING_TILT_MESSAGE, resolveTiltAvailability } from "../starlark.js";

// The Tilt lookup is stubbed, so these run the same with or without Tilt installed.
describe("resolveTiltAvailability when Tilt is missing", () => {
  it("skips the Starlark suites with one warning when TDK_REQUIRE_TILT is unset", () => {
    const warn = vi.fn();
    expect(resolveTiltAvailability(() => false, {}, warn)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(MISSING_TILT_MESSAGE);
  });

  it("fails with the same message when TDK_REQUIRE_TILT=1, and does not warn", () => {
    const warn = vi.fn();
    expect(() => resolveTiltAvailability(() => false, { TDK_REQUIRE_TILT: "1" }, warn)).toThrow(
      MISSING_TILT_MESSAGE,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("runs the suites, silently, when Tilt is found, even with TDK_REQUIRE_TILT=1", () => {
    const warn = vi.fn();
    expect(resolveTiltAvailability(() => true, { TDK_REQUIRE_TILT: "1" }, warn)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});
