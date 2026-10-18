// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  formatBoxLine,
  formatBytes,
  formatCentered,
  formatCount,
  formatDate,
  formatPadded,
  formatShortDate,
  getStatusColor,
  getStatusIcon,
  truncate,
} from "../formatting.js";

describe("formatCount", () => {
  it("should format singular", () => {
    expect(formatCount(1, "resource")).toBe("1 resource");
  });

  it("should format plural with default suffix", () => {
    expect(formatCount(3, "resource")).toBe("3 resources");
  });

  it("should format plural with custom plural", () => {
    expect(formatCount(2, "index", "indices")).toBe("2 indices");
  });

  it("should handle zero as plural", () => {
    expect(formatCount(0, "service")).toBe("0 services");
  });
});

describe("formatDate", () => {
  it("should return a string", () => {
    const result = formatDate(new Date().toISOString());
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("should handle ISO date strings", () => {
    const date = new Date("2024-01-15T10:30:00Z");
    expect(formatDate(date.toISOString())).toBeTruthy();
  });
});

describe("formatShortDate", () => {
  it("should return a short date string", () => {
    const result = formatShortDate(new Date().toISOString());
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("getStatusColor", () => {
  it("should return green for ready status", () => {
    expect(getStatusColor("ready")).toBe("green");
  });

  it("should return green for healthy status", () => {
    expect(getStatusColor("healthy")).toBe("green");
  });

  it("should return red for error status", () => {
    expect(getStatusColor("error")).toBe("red");
  });

  it("should return yellow for pending status", () => {
    expect(getStatusColor("pending")).toBe("yellow");
  });

  it("should return gray for unknown status", () => {
    expect(getStatusColor("unknown")).toBe("gray");
  });

  it("should handle undefined status", () => {
    expect(getStatusColor(undefined)).toBe("gray");
  });
});

describe("getStatusIcon", () => {
  it("should return ✓ for ready", () => {
    expect(getStatusIcon("ready")).toBe("✓");
  });

  it("should return ✗ for error", () => {
    expect(getStatusIcon("error")).toBe("✗");
  });

  it("should return ? for unknown", () => {
    expect(getStatusIcon("unknown")).toBe("?");
  });
});

describe("truncate", () => {
  it("should not truncate short strings", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("should truncate long strings with ellipsis", () => {
    const result = truncate("hello world this is long", 10);
    expect(result).toBe("hello w...");
    expect(result.length).toBe(10);
  });

  it("should handle empty string", () => {
    expect(truncate("", 5)).toBe("");
  });

  it("should handle exactly max length", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });
});

describe("formatBytes", () => {
  it("should format bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("should format kilobytes", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("should format megabytes", () => {
    expect(formatBytes(1048576)).toBe("1.0 MB");
  });

  it("should handle zero", () => {
    expect(formatBytes(0)).toBe("0 B");
  });
});

describe("formatCentered", () => {
  it("should center text within width", () => {
    const result = formatCentered("hi", 10);
    expect(result.length).toBe(10);
    expect(result).toContain("hi");
  });

  it("should handle text longer than width (returns as-is, no truncation)", () => {
    const result = formatCentered("hello world", 5);
    expect(result).toBe("hello world");
  });
});

describe("formatPadded", () => {
  it("should pad short text to width", () => {
    const result = formatPadded("hi", 10);
    expect(result.length).toBe(10);
    expect(result).toMatch(/^hi\s+$/);
  });

  it("should truncate long text with ellipsis", () => {
    const result = formatPadded("hello world", 6);
    expect(result).toBe("hello…");
    expect(result.length).toBe(6);
  });
});

describe("formatBoxLine", () => {
  it("should return default width line", () => {
    const result = formatBoxLine();
    expect(result.length).toBe(62);
    expect(result).toBe("─".repeat(62));
  });

  it("should accept custom char and width", () => {
    const result = formatBoxLine("=", 10);
    expect(result).toBe("=".repeat(10));
  });
});
