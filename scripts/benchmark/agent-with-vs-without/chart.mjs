#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

// Draws the 1270×760 gallery chart from <results>/summary.json: medians per prompt, with vs without Flisk.
// Writes chart.svg, and chart.png when rsvg-convert is installed.
// Usage: node scripts/benchmark/agent-with-vs-without/chart.mjs <results-dir>

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = resolve(process.argv[2] ?? ".");
const { summary } = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
const env = existsSync(join(dir, "environment.json")) ? JSON.parse(readFileSync(join(dir, "environment.json"), "utf8")) : {};

const W = 1270;
const H = 760;
const C = { bg: "#0d1117", ink: "#f0f3f6", muted: "#9198a1", grid: "#262c36", flisk: "#4f9dff", other: "#7d8590" };
const PROMPTS = [
	{ id: "shop", label: "Online shop" },
	{ id: "ai-agent", label: "AI agent + MCP + database" },
].filter((p) => summary.some((s) => s.prompt === p.id));
const ARMS = [
	{ id: "flisk", label: "With Flisk", color: C.flisk },
	{ id: "no-flisk", label: "Without Flisk", color: C.other },
];
const get = (prompt, arm) => summary.find((s) => s.prompt === prompt && s.arm === arm);
const med = (stat, scale = 1) => (stat && stat.n ? stat.median / scale : undefined);
const PANELS = [
	{ title: "Minutes to healthy", value: (s) => med(s?.timeToHealthySec, 60), fmt: (v) => v.toFixed(1), missing: "failed" },
	{ title: "Tokens (millions)", value: (s) => med(s?.totalTokens, 1e6), fmt: (v) => v.toFixed(2) },
	{ title: "Config files hand-written", value: (s) => med(s?.infraFilesHandWritten), fmt: (v) => v.toFixed(0) },
	{ title: "Worked with no help", value: (s) => (s ? s.succeeded / s.runs : undefined), fmt: (_v, s) => `${s.succeeded}/${s.runs}`, max: 1 },
];

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const out = [];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, Helvetica Neue, Helvetica, Arial, sans-serif">`);
out.push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);
out.push(`<text x="60" y="78" fill="${C.ink}" font-size="38" font-weight="700">Same AI agent, same prompt: with Flisk vs without</text>`);
const runsPer = Math.max(...summary.map((s) => s.runs));
const model = env.requestedModel ? `Claude Code (${env.requestedModel})` : "Claude Code";
const runsNote = runsPer === 1 ? "n=1: one run per bar, not a median" : `n=${runsPer}: bars show the median of ${runsPer} runs`;
out.push(`<text x="60" y="116" fill="${C.muted}" font-size="20">${esc(`${model}, fresh empty folder each run, ${runsNote}. Measured ${String(env.date ?? "").slice(0, 10)}.`)}</text>`);
// Legend
let lx = 60;
for (const a of ARMS) {
	out.push(`<rect x="${lx}" y="140" width="18" height="18" rx="3" fill="${a.color}"/>`);
	out.push(`<text x="${lx + 28}" y="155" fill="${C.ink}" font-size="18">${a.label}</text>`);
	lx += 190;
}

const top = 190;
const panelW = (W - 120 - 3 * 30) / 4;
const panelH = 470;
PANELS.forEach((p, i) => {
	const x0 = 60 + i * (panelW + 30);
	out.push(`<rect x="${x0}" y="${top}" width="${panelW}" height="${panelH}" rx="12" fill="#161b22" stroke="${C.grid}"/>`);
	out.push(`<text x="${x0 + 20}" y="${top + 40}" fill="${C.ink}" font-size="20" font-weight="600">${esc(p.title)}</text>`);
	const vals = PROMPTS.flatMap((pr) => ARMS.map((a) => p.value(get(pr.id, a.id)))).filter((v) => Number.isFinite(v));
	const max = p.max ?? Math.max(...vals, 1e-9);
	const barMaxH = 300;
	const baseY = top + 400;
	const groupW = (panelW - 40) / PROMPTS.length;
	PROMPTS.forEach((pr, j) => {
		const gx = x0 + 20 + j * groupW;
		const bw = Math.min(56, (groupW - 30) / 2);
		ARMS.forEach((a, k) => {
			const s = get(pr.id, a.id);
			const v = p.value(s);
			const bx = gx + (groupW - 2 * bw - 10) / 2 + k * (bw + 10);
			if (!Number.isFinite(v)) {
				out.push(`<text x="${bx + bw / 2}" y="${baseY - 10}" fill="${C.muted}" font-size="16" text-anchor="middle">${s ? (p.missing ?? "n/a") : "n/a"}</text>`);
				return;
			}
			const h = Math.max(3, (v / max) * barMaxH);
			out.push(`<rect x="${bx}" y="${baseY - h}" width="${bw}" height="${h}" rx="4" fill="${a.color}"/>`);
			out.push(`<text x="${bx + bw / 2}" y="${baseY - h - 10}" fill="${C.ink}" font-size="18" font-weight="600" text-anchor="middle">${esc(p.fmt(v, s))}</text>`);
		});
		out.push(`<text x="${gx + groupW / 2}" y="${baseY + 30}" fill="${C.muted}" font-size="15" text-anchor="middle">${esc(pr.label.length > 16 ? pr.label.replace(" + MCP + database", "") : pr.label)}</text>`);
	});
	out.push(`<line x1="${x0 + 16}" x2="${x0 + panelW - 16}" y1="${baseY}" y2="${baseY}" stroke="${C.grid}" stroke-width="2"/>`);
});
out.push(`<text x="60" y="${H - 40}" fill="${C.muted}" font-size="17">Raw runs, transcripts and the harness: github.com/flisk-sh/flisk · docs/benchmarks/results</text>`);
out.push("</svg>");
writeFileSync(join(dir, "chart.svg"), out.join("\n"));
const r = spawnSync("rsvg-convert", ["-w", String(W), "-h", String(H), "-o", join(dir, "chart.png"), join(dir, "chart.svg")]);
console.log(r.status === 0 ? `wrote ${join(dir, "chart.png")}` : "wrote chart.svg (install rsvg-convert for the PNG)");
