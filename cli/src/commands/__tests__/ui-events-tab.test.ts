// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { TABS } from "../../components/TabBar.js";

describe("flisk ui tab navigation", () => {
  it("keeps every visible tab on one consecutive shared shortcut list", () => {
    expect(TABS.map((tab) => [tab.id, tab.shortcut])).toEqual([
      ["overview", "1"],
      ["resources", "2"],
      ["events", "3"],
      ["files", "4"],
      ["config", "5"],
    ]);
  });
});
