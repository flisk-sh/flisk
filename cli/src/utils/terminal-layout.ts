// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
export type TabBarDensity = "compact" | "standard" | "wide";

const COMPACT_TAB_WIDTH = 76;
const WIDE_TAB_WIDTH = 100;

export function getTerminalRuleWidth(terminalWidth: number): number {
  return Math.max(0, Math.min(terminalWidth - 4, 100));
}

export function getTabBarDensity(terminalWidth: number): TabBarDensity {
  if (terminalWidth < COMPACT_TAB_WIDTH) return "compact";
  if (terminalWidth < WIDE_TAB_WIDTH) return "standard";
  return "wide";
}

/**
 * Convert an SGR mouse row (1-based) to an Ink layout row (0-based).
 * The UI uses Ink's alternate screen with no Static content, so the live region starts at row 1.
 */
export function getListRowFromMouseY(mouseY: number, listTop: number): number {
  return mouseY - 1 - listTop;
}
