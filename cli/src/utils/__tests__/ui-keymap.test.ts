// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { formatUiKeyHint, formatUiKeyNames, TABS, UI_KEYMAP } from "../ui-keymap.js";

describe("flisk ui keymap", () => {
  it("has labeled entries with unique ids and keys", () => {
    const ids = UI_KEYMAP.map((shortcut) => shortcut.id);
    const keys = UI_KEYMAP.flatMap((shortcut) => shortcut.keys);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(keys).size).toBe(keys.length);
    expect(UI_KEYMAP.every((shortcut) => shortcut.label.trim().length > 0)).toBe(true);
    expect(
      UI_KEYMAP.every(
        (shortcut) => shortcut.group === "Navigation" || shortcut.group === "Actions",
      ),
    ).toBe(true);
  });

  it("derives direct-tab help from the shared tab list", () => {
    expect(formatUiKeyHint("direct-tabs", "Tabs")).toBe(
      `[${TABS[0].shortcut}-${TABS[TABS.length - 1].shortcut}] Tabs`,
    );
  });

  it("formats navigation keys for Unicode and ASCII terminals", () => {
    expect(formatUiKeyNames("list-navigation")).toBe("↑/↓ or k/j");
    expect(formatUiKeyNames("list-navigation", true)).toBe("UP/DOWN or k/j");
  });
});
