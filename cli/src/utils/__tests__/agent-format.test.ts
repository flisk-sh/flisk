// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { formatAge } from "../agent-format.js";

describe("formatAge", () => {
  const now = Date.parse("2026-11-11T12:00:00.000Z");

  it("returns '-' when iso is null", () => {
    expect(formatAge(null, now)).toBe("-");
  });

  it("returns invalid date strings unchanged", () => {
    expect(formatAge("not-a-date", now)).toBe("not-a-date");
    expect(formatAge("invalid date", now)).toBe("invalid date");
  });

  describe("boundary cases", () => {
    it("formats 0 seconds as '0s ago'", () => {
      const iso = new Date(now).toISOString();
      expect(formatAge(iso, now)).toBe("0s ago");
    });

    it("formats 59 seconds as '59s ago'", () => {
      const iso = new Date(now - 59 * 1000).toISOString();
      expect(formatAge(iso, now)).toBe("59s ago");
    });

    it("formats 60 seconds as '1m ago'", () => {
      const iso = new Date(now - 60 * 1000).toISOString();
      expect(formatAge(iso, now)).toBe("1m ago");
    });

    it("formats 3599 seconds as '59m ago'", () => {
      const iso = new Date(now - 3599 * 1000).toISOString();
      expect(formatAge(iso, now)).toBe("59m ago");
    });

    it("formats 3600 seconds as '1h ago'", () => {
      const iso = new Date(now - 3600 * 1000).toISOString();
      expect(formatAge(iso, now)).toBe("1h ago");
    });

    it("formats 86399 seconds as '23h ago'", () => {
      const iso = new Date(now - 86399 * 1000).toISOString();
      expect(formatAge(iso, now)).toBe("23h ago");
    });

    it("formats 86400 seconds as '1d ago'", () => {
      const iso = new Date(now - 86400 * 1000).toISOString();
      expect(formatAge(iso, now)).toBe("1d ago");
    });
  });

  it("clamps future timestamps to '0s ago'", () => {
    const futureIso = new Date(now + 10_000).toISOString();
    expect(formatAge(futureIso, now)).toBe("0s ago");
  });
});
