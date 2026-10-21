// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { describeSearch } from "../search-status.js";

describe("describeSearch", () => {
  it("returns null without a query", () => {
    expect(describeSearch("", 5, 5)).toBeNull();
    expect(describeSearch("", 0, 0)).toBeNull();
  });

  it("reports matches out of total", () => {
    expect(describeSearch("api", 2, 5)).toEqual({ summary: "2 of 5" });
  });

  it("reports full match when matches equals total", () => {
    expect(describeSearch("web", 4, 4)).toEqual({ summary: "4 of 4" });
  });

  it("reports single match out of 1", () => {
    expect(describeSearch("backend", 1, 1)).toEqual({ summary: "1 of 1" });
  });

  it("formats large numbers correctly", () => {
    expect(describeSearch("logs", 150, 1000)).toEqual({ summary: "150 of 1000" });
  });

  it("explains an empty result", () => {
    expect(describeSearch("zzz", 0, 5)).toEqual({
      summary: "0 matches",
      emptyMessage: 'No resources match "zzz". Press Esc to clear.',
    });
  });

  it("preserves exact query string in emptyMessage when 0 matches found", () => {
    expect(describeSearch("my-custom-service", 0, 12)).toEqual({
      summary: "0 matches",
      emptyMessage: 'No resources match "my-custom-service". Press Esc to clear.',
    });
  });

  it("handles 0 matches when total resources is 0", () => {
    expect(describeSearch("test", 0, 0)).toEqual({
      summary: "0 matches",
      emptyMessage: 'No resources match "test". Press Esc to clear.',
    });
  });
});
