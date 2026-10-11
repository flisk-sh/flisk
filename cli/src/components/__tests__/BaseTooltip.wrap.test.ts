// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { wrapContent } from "../BaseTooltip.js";

describe("wrapContent", () => {
  it("does not return an empty first line for a word wider than the tooltip", () => {
    expect(wrapContent("supercalifragilisticexpialidocious", 10)).toEqual([
      "supercalifragilisticexpialidocious",
    ]);
  });

  it("wraps a long word in the middle of a sentence without empty lines", () => {
    expect(wrapContent("a supercalifragilistic b", 10)).toEqual(["a", "supercalifragilistic", "b"]);
  });
});
