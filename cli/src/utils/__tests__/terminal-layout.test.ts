// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  getListRowFromMouseY,
  getTabBarDensity,
  getTerminalRuleWidth,
} from "../terminal-layout.js";

describe("terminal layout helpers", () => {
  describe("getTerminalRuleWidth", () => {
    it.each([
      [60, 56],
      [80, 76],
      [104, 100],
      [105, 100],
      [120, 100],
      [500, 100],
      [5, 1],
      [4, 0],
      [3, 0],
      [2, 0],
      [0, 0],
      [-10, 0],
    ])("sizes terminal rules at %i columns -> %i", (terminalWidth, expected) => {
      expect(getTerminalRuleWidth(terminalWidth)).toBe(expected);
    });
  });

  describe("getTabBarDensity", () => {
    it.each([
      [-5, "compact"],
      [0, "compact"],
      [50, "compact"],
      [75, "compact"],
      [76, "standard"],
      [80, "standard"],
      [99, "standard"],
      [100, "wide"],
      [120, "wide"],
      [200, "wide"],
    ] as const)("chooses a tab density at %i columns -> %s", (terminalWidth, expected) => {
      expect(getTabBarDensity(terminalWidth)).toBe(expected);
    });
  });

  describe("getListRowFromMouseY", () => {
    it.each([
      [8, 7, 0],
      [9, 7, 1],
      [12, 10, 1],
      [7, 7, -1],
      [1, 0, 0],
      [1, 5, -5],
      [15, 5, 9],
      [0, 0, -1],
      [-3, 2, -6],
    ])("maps terminal row %i against list top %i -> %i", (mouseY, listTop, expected) => {
      expect(getListRowFromMouseY(mouseY, listTop)).toBe(expected);
    });
  });
});
