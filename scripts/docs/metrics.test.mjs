// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for scripts/docs/metrics.mjs: Arial text widths, scaling, and the monospace advance.
//   node --test scripts/docs/metrics.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { MONO_ADVANCE, textWidth } from "./metrics.mjs";

test("empty text has zero width", () => {
  assert.equal(textWidth("", 14), 0);
});

test("printable ASCII boundaries use their Arial advances", () => {
  assert.equal(textWidth(" ", 1000), 278);
  assert.equal(textWidth("~", 1000), 584);
});

test("the default weight uses regular Arial advances", () => {
  assert.equal(textWidth("A", 1000), 667);
  assert.equal(textWidth("A", 1000, 400), 667);
});

test("weight 600 uses bold Arial advances", () => {
  assert.equal(textWidth("A", 1000, 600), 722);
});

test("characters outside printable ASCII use one fallback advance per code point", () => {
  for (const ch of ["\u001f", "\u007f", "é", "→", "😀"]) {
    assert.equal(textWidth(ch, 1000), 556, JSON.stringify(ch));
  }
});

test("text width adds the character advances", () => {
  assert.equal(textWidth("AB", 1000), 1334);
  assert.equal(textWidth("AB", 1000), textWidth("A", 1000) + textWidth("B", 1000));
});

test("scaling rounds fractional widths up to a whole pixel", () => {
  assert.equal(textWidth("A", 10), 7);
});

test("rounding happens after adding the character advances", () => {
  assert.equal(textWidth("AB", 2), 3);
});

test("the monospace advance is 0.6 of the font size", () => {
  assert.equal(MONO_ADVANCE, 0.6);
});
