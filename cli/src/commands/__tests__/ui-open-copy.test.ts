// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UI_KEYMAP } from "../../utils/ui-keymap.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ui = readFileSync(join(repoRoot, "cli", "src", "commands", "ui.tsx"), "utf-8");

describe("ui open and copy shortcuts", () => {
  it("registers 'o' and 'y' in UI_KEYMAP for help panel", () => {
    const openEntry = UI_KEYMAP.find((entry) => entry.id === "open-url");
    const copyEntry = UI_KEYMAP.find((entry) => entry.id === "copy-url");

    expect(openEntry).toBeDefined();
    expect(openEntry?.keys).toContain("o");
    expect(openEntry?.group).toBe("Actions");

    expect(copyEntry).toBeDefined();
    expect(copyEntry?.keys).toContain("y");
    expect(copyEntry?.group).toBe("Actions");
  });

  it("handles 'o' key in useInput by calling openUrl", () => {
    expect(ui).toContain('if (input === "o") {');
    expect(ui).toContain("openUrl(target.url)");
    expect(ui).toContain('statusMessage.show("No URL for this resource", 2000)');
  });

  it("handles 'y' key in useInput by calling copyToClipboard", () => {
    expect(ui).toContain('if (input === "y") {');
    expect(ui).toContain("copyToClipboard(target.url)");
    expect(ui).toContain("Copied " + "$" + "{target.url}");
  });

  it("includes open and copy hints in resources tab footer", () => {
    expect(ui).toContain('formatUiKeyHint("open-url", "open", ascii)');
    expect(ui).toContain('formatUiKeyHint("copy-url", "copy", ascii)');
  });
});
