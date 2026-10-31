#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Fetches last-month npm download counts and writes docs/assets/npm-downloads.svg.
// Note: npm counts include CI installs and mirrors; they are downloads, not users.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PKG = "@flisk-sh/flisk";
export const API = `https://api.npmjs.org/downloads/range/last-month/${PKG}`;

export function renderSvg(data, options = {}) {
  const pkg = options.pkg ?? (!Array.isArray(data) && data?.package ? data.package : PKG);
  const rawDownloads = Array.isArray(data) ? data : (data?.downloads ?? []);
  const downloads = [...rawDownloads].sort((a, b) => (a.day ?? "").localeCompare(b.day ?? ""));
  const start = options.start ?? (!Array.isArray(data) && data?.start ? data.start : (downloads[0]?.day ?? ""));
  const end = options.end ?? (!Array.isArray(data) && data?.end ? data.end : (downloads[downloads.length - 1]?.day ?? ""));

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

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
  <title>${pkg} npm downloads ${start} to ${end}</title>
  <rect width="${w}" height="${h}" fill="#0b0b0f"/>
  <text x="${pad.l}" y="18" fill="#e4e4e7" font-family="ui-sans-serif,system-ui" font-size="13">${pkg} · ${total.toLocaleString("en-US")} npm downloads · ${start} → ${end}</text>
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
}

export { renderSvg as generateSvg, renderSvg as renderGraph };

export async function fetchDownloads(pkg = PKG, fetchFn = globalThis.fetch) {
  const api = `https://api.npmjs.org/downloads/range/last-month/${pkg}`;
  const res = await fetchFn(api);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return await res.json();
}

export async function main(options = {}) {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const pkg = options.pkg ?? PKG;
  const data = options.data ?? (await fetchDownloads(pkg, fetchFn));
  const svg = renderSvg(data, { pkg, ...options });
  const out = options.out ?? new URL("../docs/assets/npm-downloads.svg", import.meta.url);
  if (options.write !== false) {
    await writeFile(out, svg);
    const rawDownloads = Array.isArray(data) ? data : (data?.downloads ?? []);
    const n = rawDownloads.length;
    const total = rawDownloads.reduce((s, d) => s + d.downloads, 0);
    const target = out instanceof URL ? out.pathname : String(out);
    console.log(`wrote ${target} (${n} days, total ${total})`);
  }
  return svg;
}

const isMain = Boolean(
  process.argv[1] && (
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
    path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
  )
);

if (isMain) {
  await main();
}
