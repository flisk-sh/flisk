// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import type { StatusValue } from "../../types/index.js";
import {
  colorizeByStatus,
  DEFAULT_BOX_WIDTH,
  formatBoxLine,
  formatBytes,
  formatCentered,
  formatCount,
  formatDate,
  formatPadded,
  formatShortDate,
  getStatusColor,
  getStatusIcon,
  printBoxedHeader,
  showAllSatisfyCondition,
  showCancelled,
  showCommandHeader,
  showDetail,
  showEmptyState,
  showStep,
  showSuccess,
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

describe("getStatusColor / getStatusIcon category branches", () => {
  it.each<[StatusValue, string, string]>([
    ["ready", "green", "✓"],
    ["healthy", "green", "✓"],
    ["active", "green", "✓"],
    ["running", "green", "✓"],
    ["error", "red", "✗"],
    ["failed", "red", "✗"],
    ["critical", "red", "✗"],
    ["stopped", "red", "✗"],
    ["pending", "yellow", "○"],
    ["starting", "yellow", "○"],
    ["building", "yellow", "○"],
    ["degraded", "yellow", "○"],
    ["unknown", "gray", "?"],
    [undefined, "gray", "?"],
  ])("maps %s to its category color and icon", (status, color, icon) => {
    expect(getStatusColor(status)).toBe(color);
    expect(getStatusIcon(status)).toBe(icon);
  });
});

describe("colorizeByStatus", () => {
  const originalLevel = chalk.level;

  beforeEach(() => {
    chalk.level = 1;
  });

  afterEach(() => {
    chalk.level = originalLevel;
  });

  it("applies green to success statuses", () => {
    expect(colorizeByStatus("ok", "ready")).toBe(chalk.green("ok"));
  });

  it("applies red to error statuses", () => {
    expect(colorizeByStatus("bad", "failed")).toBe(chalk.red("bad"));
  });

  it("applies yellow to warning statuses", () => {
    expect(colorizeByStatus("wait", "pending")).toBe(chalk.yellow("wait"));
  });

  it("applies gray to unknown and undefined statuses", () => {
    expect(colorizeByStatus("?", "unknown")).toBe(chalk.gray("?"));
    expect(colorizeByStatus("?", undefined)).toBe(chalk.gray("?"));
  });
});

describe("console output helpers", () => {
  let logSpy: MockInstance<typeof console.log>;

  const loggedLines = (): string[] => logSpy.mock.calls.map((call) => String(call[0] ?? ""));

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("showEmptyState", () => {
    it("prints the resources empty state", () => {
      showEmptyState("resources");
      expect(loggedLines()).toEqual([
        expect.stringContaining("No resources found."),
        expect.stringContaining("To create a resource:"),
        expect.stringContaining("  flisk resource <name>"),
      ]);
    });

    it("prints the stacks empty state with the extra stack hint", () => {
      showEmptyState("stacks");
      expect(loggedLines()).toEqual([
        expect.stringContaining("No stacks found."),
        expect.stringContaining("To create a stack, use:"),
        expect.stringContaining("  flisk stack <stack-name>"),
        expect.stringContaining("Or create a new resource with a stack:"),
        expect.stringContaining("  flisk resource <name> --stack <stack-name>"),
      ]);
    });

    it("prints the services empty state", () => {
      showEmptyState("services");
      expect(loggedLines()).toEqual([
        expect.stringContaining("No services found."),
        expect.stringContaining("To create a service:"),
        expect.stringContaining("  flisk resource <name>"),
      ]);
    });

    it("prints the stack-services empty state", () => {
      showEmptyState("stack-services");
      expect(loggedLines()).toEqual([
        expect.stringContaining("No services found."),
        expect.stringContaining("To add services to this stack:"),
        expect.stringContaining("  flisk resource <name> --stack <stack-name>"),
      ]);
    });

    it("appends the filter context to the headline", () => {
      showEmptyState("resources", " matching 'redis'");
      expect(loggedLines()[0]).toContain("No resources found matching 'redis'.");
    });
  });

  describe("showCancelled", () => {
    it("prints the default message when none is given", () => {
      showCancelled();
      expect(loggedLines()).toEqual([expect.stringContaining("Cancelled.")]);
    });

    it("prints the custom message when given", () => {
      showCancelled("Nothing changed.");
      expect(loggedLines()).toEqual([expect.stringContaining("Nothing changed.")]);
    });
  });

  describe("showCommandHeader", () => {
    it("prints the title with the Flisk prefix and a trailing blank line", () => {
      showCommandHeader("up");
      expect(loggedLines()).toEqual(["Flisk up\n"]);
    });
  });

  describe("showAllSatisfyCondition", () => {
    it("prints the all-satisfy message", () => {
      showAllSatisfyCondition("services", "healthy");
      expect(loggedLines()).toEqual([expect.stringContaining("All services are healthy!")]);
    });
  });

  describe("showSuccess / showStep / showDetail", () => {
    it("showSuccess prints a check-marked message", () => {
      showSuccess("Stack created");
      expect(loggedLines()).toEqual([expect.stringContaining("✓ Stack created")]);
    });

    it("showStep prints the message as-is", () => {
      showStep("Building images");
      expect(loggedLines()).toEqual([expect.stringContaining("Building images")]);
    });

    it("showDetail indents by two spaces by default", () => {
      showDetail("port 8080");
      expect(loggedLines()).toEqual([expect.stringMatching(/^ {2}port 8080$/)]);
    });

    it("showDetail honours a custom indent", () => {
      showDetail("port 8080", 6);
      expect(loggedLines()).toEqual([expect.stringMatching(/^ {6}port 8080$/)]);
    });
  });

  describe("printBoxedHeader", () => {
    it("prints a title-only box without a subtitle divider", () => {
      printBoxedHeader("My Title", undefined, 20);
      const out = loggedLines();
      expect(out).toHaveLength(4);
      expect(out[0]).toBe("");
      expect(out[1]).toContain(`╭${"─".repeat(18)}╮`);
      expect(out[2]).toContain("My Title");
      expect(out[3]).toContain(`╰${"─".repeat(18)}╯`);
      expect(out.some((line) => line.includes("├"))).toBe(false);
    });

    it("prints a subtitle row and divider when a subtitle is given", () => {
      printBoxedHeader("My Title", "example.test", 20);
      const out = loggedLines();
      expect(out).toHaveLength(6);
      expect(out[3]).toContain(`├${"─".repeat(18)}┤`);
      expect(out[4]).toContain("example.test");
      expect(out[5]).toContain(`╰${"─".repeat(18)}╯`);
    });

    it("uses the default box width when none is given", () => {
      printBoxedHeader("T");
      const out = loggedLines();
      expect(out[1]).toContain("─".repeat(DEFAULT_BOX_WIDTH - 2));
    });
  });
});

describe("formatPadded / truncate overflow", () => {
  it("formatPadded returns text of exactly the requested width on overflow", () => {
    expect(formatPadded("abcdefgh", 4)).toBe("abc…");
    expect(formatPadded("abcdefgh", 4).length).toBe(4);
  });

  it("formatPadded leaves exact-width text unchanged", () => {
    expect(formatPadded("abcd", 4)).toBe("abcd");
  });

  it("truncate keeps total length at maxLength on overflow", () => {
    expect(truncate("abcdefghij", 5)).toBe("ab...");
    expect(truncate("abcdefghij", 5).length).toBe(5);
  });
});

describe("formatBytes units", () => {
  it("stays in bytes just below 1 KB", () => {
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("switches to KB at exactly 1 KB", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  it("rounds KB to one decimal place", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("stays in KB just below 1 MB", () => {
    expect(formatBytes(1024 * 1024 - 1)).toBe("1024.0 KB");
  });

  it("formats fractional MB", () => {
    expect(formatBytes(1024 * 1024 * 2.5)).toBe("2.5 MB");
  });
});
