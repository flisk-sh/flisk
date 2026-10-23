// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { renderToString } from "ink";
import { describe, expect, it } from "vitest";
import { TabBar } from "../TabBar.js";

const ANSI_SGR = new RegExp([String.fromCharCode(0x1b), "\\[[0-?]*[ -/]*[@-~]"].join(""), "g");
const rule = String.fromCharCode(0x2500);
const decoration = String.fromCharCode(0x2593, 0x2592, 0x2591);
const bannerEnd = String.fromCharCode(0x2591, 0x2592, 0x2593);

function renderTabBar(width: number, compact?: boolean): string {
  return renderToString(
    <TabBar activeTab="overview" onTabChange={() => {}} compact={compact} terminalWidth={width} />,
    { columns: width },
  ).replace(ANSI_SGR, "");
}

describe.each([
  {
    width: 60,
    expectedRuleWidth: 56,
    expectedActive: "[1] OVER",
    expectedOther: "[2] RESO",
    expectedDecorationCount: 1,
  },
  {
    width: 80,
    expectedRuleWidth: 76,
    expectedActive: "[1] OVERVIEW",
    expectedOther: "[2] RESOURCES",
    expectedDecorationCount: 0,
  },
  {
    width: 120,
    expectedRuleWidth: 100,
    expectedActive: "[1] OVERVIEW",
    expectedOther: "[2] RESOURCES",
    expectedDecorationCount: 1,
  },
])(
  "TabBar at $width columns",
  ({ width, expectedRuleWidth, expectedActive, expectedOther, expectedDecorationCount }) => {
    it("uses shared rule sizing and fitting tab density", () => {
      const output = renderTabBar(width);
      const ruleLines = output
        .split(/\r?\n/)
        .filter((line) => line.includes(rule.repeat(expectedRuleWidth)));
      expect(ruleLines).toHaveLength(2);
      expect(output).toContain(expectedActive);
      expect(output).toContain(expectedOther);
      expect(output.split(decoration).length - 1).toBe(expectedDecorationCount);
      expect(output.includes(bannerEnd)).toBe(width >= 100);
      expect(output.split(/\r?\n/).every((line) => Array.from(line).length <= width)).toBe(true);
    });
  },
);

describe("TabBar legacy compact prop", () => {
  it("keeps the original fixed-width presentation while callers migrate", () => {
    const output = renderToString(
      <TabBar activeTab="overview" onTabChange={() => {}} compact />,
    ).replace(ANSI_SGR, "");
    expect(output.split(/\r?\n/).filter((line) => line.includes(rule.repeat(60)))).toHaveLength(2);
    expect(output).toContain("[1] OVERVIEW");
    expect(output).toContain("[2] RESO");
    expect(output.includes(decoration)).toBe(true);
  });
});
