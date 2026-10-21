// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { renderToString } from "ink";
import { describe, expect, it } from "vitest";
import { TUIHeader } from "../TUIHeader.js";

const ANSI_SGR = new RegExp([String.fromCharCode(0x1b), "\\[[0-?]*[ -/]*[@-~]"].join(""), "g");
const projectRoot = "C:\\work\\projects\\a-very-long-project-directory";

function renderHeader(terminalWidth: number, resourceCount = 3, version = "1.3.86"): string {
  return renderToString(
    <TUIHeader
      projectRoot={projectRoot}
      resourceCount={resourceCount}
      terminalWidth={terminalWidth}
      version={version}
    />,
    { columns: terminalWidth },
  ).replace(ANSI_SGR, "");
}

function expectLinesToFit(output: string, width: number): void {
  expect(
    Math.max(...output.split(/\r?\n/).map((line) => Array.from(line).length)),
  ).toBeLessThanOrEqual(width);
}

describe("TUIHeader", () => {
  it("shows the version and discovered resource count in the compact layout", () => {
    const output = renderHeader(60);

    expect(output).toContain("Flisk v1.3.86");
    expect(output).not.toContain("▓▒░");
    expect(output).toContain("3 resources discovered");
    expect(output).toContain(projectRoot);
    expectLinesToFit(output, 60);
  });

  it("uses singular grammar for one discovered resource", () => {
    const output = renderHeader(60, 1);

    expect(output).toContain("1 resource discovered");
    expect(output).not.toContain("1 resources discovered");
    expectLinesToFit(output, 60);
  });

  it("shows zero discovered resources", () => {
    const output = renderHeader(80, 0);

    expect(output).toContain("0 resources discovered");
    expectLinesToFit(output, 80);
  });

  it("keeps the compact layout at 79 columns", () => {
    const output = renderHeader(79);

    expect(output).toContain("Flisk v1.3.86");
    expectLinesToFit(output, 79);
  });

  it("preserves the full title frame in the wide layout", () => {
    const output = renderHeader(80);

    expect(output).toContain("▓▒░ Flisk NEON EDITION v1.3.86 ░▒▓");
    expectLinesToFit(output, 80);
  });

  it("keeps the title and count within a wide terminal with long labels", () => {
    const count = 999_999_999_999_999;
    const version = "2026.10.7-preview.preview.preview.preview.preview.preview.preview.preview.";
    const output = renderHeader(80, count, version);

    expect(output).toContain("Flisk NEON EDITION");
    expect(output).toContain("999999999999999 resources discovered");
    expect(output).not.toContain(version);
    expectLinesToFit(output, 80);
  });

  it("truncates the project root in the compact layout", () => {
    const output = renderHeader(40);

    expect(output).toContain("C:\\work\\projects\\");
    expect(output).not.toContain(projectRoot);
    expectLinesToFit(output, 40);
  });

  it("fits a long project path and multi-digit resource count on narrow terminals", () => {
    const output = renderHeader(40, 12);

    expect(output).toContain("12 resources discovered");
    expectLinesToFit(output, 40);
  });

  it("truncates header text on very narrow terminals", () => {
    const output = renderHeader(10, 12);

    expectLinesToFit(output, 10);
  });
});
