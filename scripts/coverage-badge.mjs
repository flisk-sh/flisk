#!/usr/bin/env node
// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
// Reads the line coverage from cli/coverage/coverage-summary.json (written by `npm run test:coverage`)
// and writes docs/assets/coverage.svg. Run after `npm run test:coverage` in cli/, then commit the SVG via a PR:
// main is behind a merge queue, so CI cannot push the badge itself.
import { readFile, writeFile } from "node:fs/promises";

const SUMMARY = "cli/coverage/coverage-summary.json";
const OUT = "docs/assets/coverage.svg";

const summary = JSON.parse(await readFile(SUMMARY, "utf8"));
const pct = summary.total.lines.pct;
const value = `${pct.toFixed(0)}%`;

// Same thresholds as shields.io's default coverage colors.
const color = pct >= 90 ? "#4c1" : pct >= 75 ? "#a3c51c" : pct >= 60 ? "#dfb317" : pct >= 40 ? "#fe7d37" : "#e05d44";

// Approximate widths for 11px Verdana, as the shields.io flat badge uses.
const label = "coverage";
const labelW = 62;
const valueW = Math.max(30, value.length * 7 + 10);
const w = labelW + valueW;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value} (unit test line coverage)</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelW}" height="20" fill="#555"/>
    <rect x="${labelW}" width="${valueW}" height="20" fill="${color}"/>
    <rect width="${w}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelW / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelW / 2}" y="14">${label}</text>
    <text x="${labelW + valueW / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelW + valueW / 2}" y="14">${value}</text>
  </g>
</svg>
`;

await writeFile(OUT, svg);
console.log(`Wrote ${OUT}: line coverage ${pct}%`);
