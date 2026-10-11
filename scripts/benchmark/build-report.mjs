#!/usr/bin/env node
// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT

// Builds one self-contained HTML page (no external files, no network) from a tdk up benchmark run and the
// committed history in benchmarks/results. Published to GitHub Pages by .github/workflows/benchmarks.yml.
//
// Usage: node scripts/benchmark/build-report.mjs --run <run dir> --history benchmarks/results --out <dir> [--commit <sha>] [--run-url <url>]

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
	options: {
		run: { type: "string" },
		history: { type: "string", default: "benchmarks/results" },
		out: { type: "string", default: "site" },
		commit: { type: "string", default: "" },
		"run-url": { type: "string", default: "" },
	},
});
if (!values.run) {
	console.error("Usage: node scripts/benchmark/build-report.mjs --run <run dir> [--history <dir>] [--out <dir>]");
	process.exit(2);
}

const esc = (value) =>
	String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const fmt = (value, digits = 1) => (num(value) === null ? "n/a" : Number(value).toFixed(digits));
const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null);

// One run: a summary.json written by summarize-tdk-up.mjs.
function loadRun(dir, label) {
	const summary = readJson(join(dir, "summary.json"));
	if (!summary) return null;
	return { label, environment: summary.environment ?? {}, runs: summary.runs ?? [] };
}

const current = loadRun(resolve(values.run), "This run");
if (!current) {
	console.error(`No summary.json in ${values.run}; run summarize-tdk-up.mjs first.`);
	process.exit(1);
}

// Committed history: every published tdk-up-warm-start-* folder, oldest first.
const historyDir = resolve(values.history);
const history = existsSync(historyDir)
	? readdirSync(historyDir)
			.filter((name) => name.startsWith("tdk-up-warm-start-"))
			.sort()
			.map((name) => loadRun(join(historyDir, name), name.replace("tdk-up-warm-start-", "")))
			.filter(Boolean)
	: [];

const warm = current.runs.filter((r) => r.kind === "warm" && r.outcome === "settled");
const cold = current.runs.filter((r) => r.kind === "cold" && r.outcome === "settled");
const warmWalls = warm.map((r) => r.wallSeconds).sort((a, b) => a - b);
const median = (xs) => (xs.length ? (xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2) : null);
const warmMedian = median(warmWalls);
const coldWall = cold.length ? cold[0].wallSeconds : null;
const allSettled = current.runs.length > 0 && current.runs.every((r) => r.outcome === "settled");

// Horizontal bars: width is value / max, so the longest bar fills the track.
function bars(rows, unit = "s") {
	const max = Math.max(1, ...rows.map((r) => num(r.value) ?? 0));
	return rows
		.map((r) => {
			const pct = Math.max(1, ((num(r.value) ?? 0) / max) * 100).toFixed(1);
			return `<div class="bar-row"><div class="bar-label">${esc(r.label)}</div><div class="bar-track"><div class="bar-fill${r.key ? " key" : ""}" style="width:${pct}%"></div></div><div class="bar-value">${esc(r.display ?? `${fmt(r.value)} ${unit}`)}</div></div>`;
		})
		.join("\n");
}

const statCard = (value, label) => `<div class="stat"><div class="stat-value">${esc(value)}</div><div class="stat-label">${esc(label)}</div></div>`;

const warmTab = `
<h2>Warm start</h2>
<p class="lede">Three runs after a cold start, with the golden base layers kept. Seconds until every container is healthy.</p>
<div class="stats">
${statCard(warmMedian === null ? "n/a" : `${fmt(warmMedian, 0)} s`, "median to healthy")}
${statCard(warmWalls.length ? `${fmt(warmWalls[0], 0)} to ${fmt(warmWalls[warmWalls.length - 1], 0)} s` : "n/a", "range over warm runs")}
${statCard(warm.length ? warm.map((r) => (r.goldenSkipped === true ? "skipped" : "rebuilt")).join(", ") : "n/a", "golden base layers")}
</div>
${bars(warm.map((r) => ({ label: r.name, value: r.wallSeconds, key: r.wallSeconds === warmWalls[0] })))}
`;

const coldTab = cold.length
	? `
<h2>Cold start</h2>
<p class="lede">One run with the golden layers, service images and build cache removed first: a full rebuild.</p>
<div class="stats">
${statCard(`${fmt(coldWall, 0)} s`, "to healthy, full rebuild")}
${statCard(`${fmt(cold[0].goldenSeconds, 0)} s`, "golden base layers")}
${statCard(`${fmt(cold[0].spanSeconds, 0)} s`, "span of the image builds")}
</div>
${bars([
	{ label: "golden base", value: cold[0].goldenSeconds },
	{ label: "image builds", value: cold[0].spanSeconds },
	{ label: "to healthy", value: coldWall, key: true },
])}`
	: `<h2>Cold start</h2><p class="lede">No settled cold run in this result.</p>`;

const services = [...new Set(current.runs.flatMap((r) => r.resources.map((x) => x.resource)))].filter((name) =>
	/-(api|app|worker)$/.test(name),
);
const perService = `
<h2>Per service</h2>
<p class="lede">Image build time per service, in seconds, for each run.</p>
<table><thead><tr><th>Service</th>${current.runs.map((r) => `<th>${esc(r.name)}</th>`).join("")}</tr></thead><tbody>
${services
	.map((service) => {
		const cells = current.runs.map((r) => {
			const hit = r.resources.find((x) => x.resource === service);
			return hit ? `<td class="num">${fmt(hit.seconds)}</td>` : `<td class="num">n/a</td>`;
		});
		return `<tr><th>${esc(service)}</th>${cells.join("")}</tr>`;
	})
	.join("\n")}
</tbody></table>`;

const historyRows = history.map((h) => {
	const hWarm = median(h.runs.filter((r) => r.kind === "warm" && r.outcome === "settled").map((r) => r.wallSeconds).sort((a, b) => a - b));
	const hCold = h.runs.find((r) => r.kind === "cold" && r.outcome === "settled");
	return { label: h.label, cold: hCold ? hCold.wallSeconds : null, warm: hWarm };
});
const historyTab = `
<h2>History</h2>
<p class="lede">Every published result in <code>benchmarks/results</code>. Each machine is different; compare a row with its own environment, not across rows.</p>
${historyRows.length ? `<table><thead><tr><th>Result</th><th>Cold to healthy (s)</th><th>Warm median to healthy (s)</th></tr></thead><tbody>
${historyRows.map((h) => `<tr><th>${esc(h.label)}</th><td class="num">${fmt(h.cold, 0)}</td><td class="num">${fmt(h.warm, 0)}</td></tr>`).join("\n")}
</tbody></table>` : "<p>No published results yet.</p>"}
`;

const envRows = Object.entries(current.environment).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("\n");
const envTab = `
<h2>Environment</h2>
<table><tbody>
<tr><th>Commit</th><td>${esc(values.commit || "unknown")}</td></tr>
<tr><th>Workflow run</th><td>${values["run-url"] ? `<a href="${esc(values["run-url"])}">${esc(values["run-url"])}</a>` : "local run"}</td></tr>
${envRows}
</tbody></table>
<p class="lede">Docker VM memory is only sampled on macOS runners; elsewhere it is reported as not sampled.</p>`;

const status = allSettled ? `<span class="pill ok">all runs settled</span>` : `<span class="pill bad">a run did not settle</span>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TDK benchmarks: tdk up warm and cold start</title>
<style>
:root { color-scheme: light dark; --fg:#1d1f24; --muted:#5b6170; --bg:#fff; --card:#f4f6fa; --line:#dfe3ec; --accent:#6d4aff; --ok:#1f8f4e; --bad:#c0392b; }
@media (prefers-color-scheme: dark) { :root { --fg:#ecedf2; --muted:#a4a9b8; --bg:#101216; --card:#1a1d24; --line:#2c303b; --accent:#b79aff; } }
* { box-sizing: border-box; }
body { margin:0; font: 16px/1.5 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; background:var(--bg); color:var(--fg); }
header { padding: 2rem 1.25rem 1rem; max-width: 980px; margin: 0 auto; }
header h1 { font-size: 2rem; margin: 0 0 .4rem; }
header p { color: var(--muted); margin: .2rem 0; font-size: 1.05rem; }
main { max-width: 980px; margin: 0 auto; padding: 0 1.25rem 3rem; }
nav.tabs { display:flex; flex-wrap:wrap; gap:.4rem; border-bottom:1px solid var(--line); margin: 1rem 0 1.25rem; }
nav.tabs button { font: inherit; font-size: 1rem; padding:.6rem 1rem; background:none; border:0; color:var(--muted); cursor:pointer; border-bottom:3px solid transparent; }
nav.tabs button[aria-selected="true"] { color:var(--fg); border-bottom-color: var(--accent); font-weight:600; }
section[hidden] { display:none; }
h2 { font-size: 1.5rem; margin: .5rem 0 .3rem; }
.lede { color: var(--muted); font-size: 1.05rem; margin: .2rem 0 1rem; }
.stats { display:grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap:.75rem; margin: 1rem 0 1.5rem; }
.stat { background:var(--card); border:1px solid var(--line); border-radius:12px; padding: 1rem 1.1rem; }
.stat-value { font-size: 1.6rem; font-weight: 700; }
.stat-label { color: var(--muted); font-size: .95rem; margin-top: .15rem; }
.bar-row { display:grid; grid-template-columns: 9rem 1fr 7rem; gap:.75rem; align-items:center; margin: .55rem 0; }
.bar-label { font-size: 1rem; }
.bar-track { background:var(--card); border:1px solid var(--line); border-radius:999px; height: 1.35rem; overflow:hidden; }
.bar-fill { height:100%; background: var(--accent); opacity:.75; border-radius:999px; }
.bar-fill.key { opacity:1; }
.bar-value { font-variant-numeric: tabular-nums; text-align:right; font-size:1rem; }
table { width:100%; border-collapse: collapse; margin: .75rem 0 1.5rem; font-size: 1rem; }
th, td { text-align:left; padding:.5rem .6rem; border-bottom:1px solid var(--line); }
td.num { text-align:right; font-variant-numeric: tabular-nums; }
thead th { color: var(--muted); font-weight:600; }
code { font-size: .95em; }
.pill { display:inline-block; padding:.2rem .65rem; border-radius:999px; font-size:.95rem; font-weight:600; color:#fff; }
.pill.ok { background: var(--ok); } .pill.bad { background: var(--bad); }
footer { max-width: 980px; margin: 0 auto; padding: 0 1.25rem 2rem; color: var(--muted); font-size: .95rem; }
footer a { color: var(--accent); }
</style></head>
<body>
<header>
<h1>TDK benchmarks</h1>
<p>How long <code>tdk up</code> takes to bring a real project's containers to healthy, cold and warm.</p>
<p>${status} &nbsp; project: ${esc(current.environment.project ?? "unknown")} &nbsp; commit ${esc((values.commit || "unknown").slice(0, 12))}</p>
</header>
<main>
<nav class="tabs" role="tablist">
<button role="tab" aria-selected="true" aria-controls="t-warm" id="b-warm">Warm start</button>
<button role="tab" aria-selected="false" aria-controls="t-cold" id="b-cold">Cold start</button>
<button role="tab" aria-selected="false" aria-controls="t-service" id="b-service">Per service</button>
<button role="tab" aria-selected="false" aria-controls="t-history" id="b-history">History</button>
<button role="tab" aria-selected="false" aria-controls="t-env" id="b-env">Environment</button>
</nav>
<section id="t-warm" role="tabpanel" aria-labelledby="b-warm">${warmTab}</section>
<section id="t-cold" role="tabpanel" aria-labelledby="b-cold" hidden>${coldTab}</section>
<section id="t-service" role="tabpanel" aria-labelledby="b-service" hidden>${perService}</section>
<section id="t-history" role="tabpanel" aria-labelledby="b-history" hidden>${historyTab}</section>
<section id="t-env" role="tabpanel" aria-labelledby="b-env" hidden>${envTab}</section>
</main>
<footer>
Source: <a href="https://github.com/tdk-landscape/tdk-cli-core/tree/main/scripts/benchmark">scripts/benchmark</a> · reproduce with <code>scripts/benchmark/tdk-up-warm-start.sh</code> · raw data in <a href="https://github.com/tdk-landscape/tdk-cli-core/tree/main/benchmarks/results">benchmarks/results</a>
</footer>
<script>
(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  function show(tab) {
    tabs.forEach(function (t) { t.setAttribute('aria-selected', t === tab ? 'true' : 'false'); });
    document.querySelectorAll('[role="tabpanel"]').forEach(function (p) { p.hidden = p.id !== tab.getAttribute('aria-controls'); });
    if (history.replaceState) history.replaceState(null, '', '#' + tab.getAttribute('aria-controls').replace('t-', ''));
  }
  tabs.forEach(function (t) { t.addEventListener('click', function () { show(t); }); });
  var wanted = location.hash.replace('#', '');
  var start = tabs.find(function (t) { return t.getAttribute('aria-controls') === 't-' + wanted; });
  if (start) show(start);
})();
</script>
</body></html>
`;

const out = resolve(values.out);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "index.html"), html);
writeFileSync(join(out, "run-summary.json"), JSON.stringify(current, null, 2) + "\n");
console.log(`wrote ${join(out, "index.html")} (${history.length} published results in history)`);
