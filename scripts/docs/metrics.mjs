// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Text widths for the docs tab images (scripts/docs/tabs.mjs, scripts/docs/frames.mjs). An SVG shown as an image cannot measure
// its own text, so labels are sized here and pinned with textLength.
// Arial advance widths for U+0020..U+007E in 1/1000 em, measured with canvas measureText. Other characters count as 556.
const ARIAL = {
  400: [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
    556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
    556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
  ],
  600: [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
    556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611,
    611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
  ],
};

export function textWidth(text, size, weight = 400) {
  const table = ARIAL[weight];
  let units = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    units += code >= 32 && code <= 126 ? table[code - 32] : 556;
  }
  return Math.ceil((units * size) / 1000);
}

// Monospace advance as a share of the font size (SF Mono, Menlo, Consolas and DejaVu Sans Mono are 0.55-0.62).
export const MONO_ADVANCE = 0.6;
