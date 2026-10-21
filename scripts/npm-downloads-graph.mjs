#!/usr/bin/env node
// Copyright (c) 2026 Flisk contributors
// SPDX-License-Identifier: MIT
// Fetches last-month npm download counts and writes docs/assets/npm-downloads.svg.
// Note: npm counts include CI installs and mirrors; they are downloads, not users.
import { writeFile } from "node:fs/promises";

const PKG = "flisk";
const API = `https://api.npmjs.org/downloads/range/last-month/${PKG}`;

const res = await fetch(API);
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
const { start, end, downloads } = await res.json();

const w = 720, h = 220, pad = { l: 44, r: 16, t: 28, b: 36 };
const innerW = w - pad.l - pad.r;
const innerH = h - pad.t - pad.b;
const n = downloads.length;
const max = Math.max(1, ...downloads.map((d) => d.downloads));
const total = downloads.reduce((s, d) => s + d.downloads, 0);

const x = (i) => pad.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
const y = (v) => pad.t + innerH - (v / max) * innerH;
const pts = downloads.map((d, i) => `${x(i).toFixed(1)},${y(d.downloads).toFixed(1)}`).join(" ");
const ticks = [...new Set([0, Math.round(max / 2), max])];
const labelEvery = Math.max(1, Math.floor(n / 6));

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
  <title>${PKG} npm downloads ${start} to ${end}</title>
  <rect width="${w}" height="${h}" fill="#0b0b0f"/>
  <text x="${pad.l}" y="18" fill="#e4e4e7" font-family="ui-sans-serif,system-ui" font-size="13">${PKG} · ${total.toLocaleString("en-US")} npm downloads · ${start} → ${end}</text>
${ticks.map((t) => {
  const yy = y(t).toFixed(1);
  return `  <line x1="${pad.l}" x2="${w - pad.r}" y1="${yy}" y2="${yy}" stroke="#27272a"/>
  <text x="${pad.l - 6}" y="${(Number(yy) + 4).toFixed(1)}" fill="#71717a" font-size="10" text-anchor="end" font-family="ui-monospace,monospace">${t}</text>`;
}).join("\n")}
  <polyline fill="none" stroke="#7c4dff" stroke-width="2" points="${pts}"/>
${downloads.map((d, i) => (i % labelEvery === 0 || i === n - 1)
  ? `  <text x="${x(i).toFixed(1)}" y="${h - 10}" fill="#71717a" font-size="9" text-anchor="middle" font-family="ui-monospace,monospace">${d.day.slice(5)}</text>`
  : "").filter(Boolean).join("\n")}
</svg>
`;

const out = new URL("../docs/assets/npm-downloads.svg", import.meta.url);
await writeFile(out, svg);
console.log(`wrote ${out.pathname} (${n} days, total ${total})`);
