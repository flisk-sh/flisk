#!/usr/bin/env node
// Scripted benchmark of the 10-part shop: one folder per tool under bench/competitors/<id>/ holding the shop in that
// tool's format and a bench.json contract. No LLM agent is involved, so a run is repeatable and cheap enough for CI.
//
//   node scripts/bench/run.mjs                      run every competitor
//   node scripts/bench/run.mjs --only flisk,compose run some
//   node scripts/bench/run.mjs --list               list competitors and whether their tool is installed
//
// Per competitor it measures: first start to healthy, an order through the gateway to `shipped`, stop, restart to healthy
// with the data kept, and the static wiring checks W1-W7 (docs/benchmarks/agent-build-bench-2026-11-10.md).
// Results: <out>/results.json and <out>/report.md. The contract is described in bench/README.md.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCompetitors, renderReport, scanWiring, validateContract } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const benchDir = path.join(root, "bench");

function parseArgs(argv) {
	const o = { only: null, list: false, out: null, work: process.env.BENCH_WORK || null, timeout: null, keep: false, help: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--only") o.only = argv[++i].split(",").filter(Boolean);
		else if (a === "--list") o.list = true;
		else if (a === "--out") o.out = argv[++i];
		else if (a === "--work") o.work = argv[++i];
		else if (a === "--timeout") o.timeout = Number(argv[++i]);
		else if (a === "--keep") o.keep = true;
		else if (a === "-h" || a === "--help") o.help = true;
		else throw new Error(`unknown argument ${a}`);
	}
	return o;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();
const secs = (ms) => Math.round(ms / 100) / 10;

async function freePort() {
	return new Promise((resolve, reject) => {
		const s = net.createServer();
		s.once("error", reject);
		s.listen(0, "127.0.0.1", () => {
			const { port } = s.address();
			s.close(() => resolve(port));
		});
	});
}

function sh(cmd, { cwd, env, timeoutMs = 600_000 } = {}) {
	const r = spawnSync("sh", ["-c", cmd], { cwd, env, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
	return { code: r.status ?? (r.signal ? 124 : 1), out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

function have(cmd) {
	return spawnSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8" }).status === 0;
}

async function get(url, init = {}) {
	try {
		// `*.localhost` names (Flisk routes by host) do not resolve through every libc: connect to loopback, keep the Host header.
		const u = new URL(url);
		const headers = { ...(init.headers ?? {}) };
		if (u.hostname.endsWith(".localhost")) {
			headers.host = u.host;
			u.hostname = "127.0.0.1";
		}
		const res = await fetch(u, { ...init, headers, signal: AbortSignal.timeout(init.timeoutMs ?? 5000) });
		const text = await res.text();
		let json = null;
		try {
			json = JSON.parse(text);
		} catch {}
		return { ok: res.ok, status: res.status, json, text };
	} catch (e) {
		return { ok: false, status: 0, json: null, text: String(e) };
	}
}

async function waitHealthy(urls, timeoutMs, child) {
	const t0 = now();
	const pending = new Set(urls);
	while (pending.size) {
		if (child?.exited && child.code !== 0) throw new Error(`start command exited with ${child.code}\n${child.tail()}`);
		if (now() - t0 > timeoutMs) throw new Error(`not healthy after ${secs(timeoutMs)}s: ${[...pending].join(", ")}`);
		await Promise.all([...pending].map(async (u) => ((await get(u)).ok ? pending.delete(u) : null)));
		if (pending.size) await sleep(1000);
	}
	return now() - t0;
}

/** Runs the start command in the background (some tools, like `tilt up`, never return) and keeps its output tail. */
function startBackground(cmd, { cwd, env, logFile }) {
	const log = fs.openSync(logFile, "a");
	const p = spawn("sh", ["-c", cmd], { cwd, env, stdio: ["ignore", log, log], detached: true });
	const h = { exited: false, code: null, tail: () => fs.readFileSync(logFile, "utf8").split("\n").slice(-25).join("\n") };
	p.on("exit", (code) => {
		h.exited = true;
		h.code = code ?? 1;
	});
	p.unref();
	return h;
}

async function runOne(c, opts, ctx) {
	const res = { id: c.id, name: c.name, status: "ok", tool: c.tool?.name ?? c.id, version: null, phases: {}, checks: {}, wiring: null, error: null };
	const work = path.join(ctx.work, c.id);
	const logFile = path.join(ctx.outDir, `${c.id}.start.log`);
	const port = await freePort();
	const env = {
		...process.env,
		BENCH_PORT: String(port),
		BENCH_PORT2: String(await freePort()),
		BENCH_PORT3: String(await freePort()),
		BENCH_PORT4: String(await freePort()),
		BENCH_DIR: work,
		BENCH_SHOP: path.join(benchDir, "shop"),
		BENCH_ID: c.id,
		BENCH_PROJECT: `flisk-bench-${c.id}`,
	};
	const sub = (v) => v.replace(/\$\{?(BENCH_PORT\d?)\}?/g, (_, n) => env[n]);
	for (const [k, v] of Object.entries(c.env ?? {})) env[k] = sub(v);
	const base = sub(c.base);
	const url = (p) => (/^https?:/.test(p) ? sub(p) : `${base}${p}`);
	const timeoutMs = (opts.timeout ?? c.timeoutSeconds ?? 900) * 1000;
	const run = (cmd, t) => sh(cmd, { cwd: work, env, timeoutMs: t });
	const healthUrls = c.health.map(sub);
	let started = false;
	try {
		for (const need of c.requires ?? []) if (!have(need)) throw Object.assign(new Error(`missing ${need}`), { skip: true });
		fs.rmSync(work, { recursive: true, force: true });
		fs.mkdirSync(path.dirname(work), { recursive: true });
		fs.cpSync(c.dir, work, { recursive: true });
		if (c.tool?.version) res.version = run(c.tool.version, 30_000).out.split("\n").pop() || null;
		if (c.setup) {
			const s = run(c.setup, 600_000);
			if (s.code !== 0) throw new Error(`setup failed (${s.code})\n${s.out.slice(-1500)}`);
		}
		res.wiring = scanWiring(work, benchDir, c);
		if (c.clean) run(c.clean, 300_000); // leftovers of an earlier run, so the first start is a first start

		// 1. first start to healthy
		started = true;
		const child = startBackground(c.start, { cwd: work, env, logFile });
		res.phases.firstStartSeconds = secs(await waitHealthy(healthUrls, timeoutMs, child));

		// 2. order flow
		const paths = c.paths;
		const products = await get(url(paths.products));
		const first = Array.isArray(products.json) ? products.json[0] : null;
		res.checks.catalogLists = Boolean(first);
		const t1 = now();
		const created = await get(url(paths.orders), {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ productId: first?.id ?? 1, quantity: 1, customer: "bench" }),
		});
		const orderId = created.json?.id;
		res.checks.orderCreated = created.status === 201 && Boolean(orderId);
		res.checks.orderPaid = created.json?.status === "paid";
		if (!orderId) throw new Error(`order was not created: HTTP ${created.status} ${created.text.slice(0, 200)}`);
		let status = created.json.status;
		while (status !== "shipped" && now() - t1 < 60_000) {
			await sleep(500);
			status = (await get(`${url(paths.orders)}/${orderId}`)).json?.status ?? status;
		}
		res.checks.orderShipped = status === "shipped";
		res.phases.orderToShippedSeconds = res.checks.orderShipped ? secs(now() - t1) : null;
		const pays = (await get(url(paths.payments))).json;
		res.checks.onePayment = Array.isArray(pays) && pays.filter((p) => p.order_id === orderId).length === 1;
		let notes = [];
		for (let i = 0; i < 20; i++) {
			notes = (await get(url(paths.notifications))).json;
			if (Array.isArray(notes) && notes.some((n) => n.order_id === orderId)) break;
			await sleep(500);
		}
		res.checks.oneNotification = Array.isArray(notes) && notes.filter((n) => n.order_id === orderId).length === 1;
		const sf = await get(url(paths.storefront));
		const ad = await get(url(paths.admin));
		res.checks.webPagesServed = sf.ok && ad.ok;

		// 3. stop: the command returns, and nothing answers afterwards
		const ts = now();
		const stopped = run(c.stop, 300_000);
		res.phases.stopSeconds = secs(now() - ts);
		if (stopped.code !== 0) res.checks.stopCommandOk = false;
		await sleep(1500);
		const still = (await Promise.all(healthUrls.map((u) => get(u, { timeoutMs: 2000 })))).filter((r) => r.ok).length;
		res.checks.stopReallyStops = still === 0;

		// 4. restart with the data kept
		const child2 = startBackground(c.start, { cwd: work, env, logFile });
		res.phases.restartSeconds = secs(await waitHealthy(healthUrls, timeoutMs, child2));
		res.checks.dataKept = (await get(`${url(paths.orders)}/${orderId}`)).json?.status === "shipped";
		res.status = Object.values(res.checks).every(Boolean) ? "ok" : "failed";
	} catch (e) {
		res.status = e.skip ? "skipped" : "failed";
		res.error = String(e.message ?? e);
	} finally {
		if (started && !opts.keep) {
			const stop = run(c.stop, 300_000);
			const purge = run(c.purge ?? c.stop, 300_000);
			if (stop.code !== 0 && purge.code !== 0) res.cleanupWarning = purge.out.slice(-300);
		}
	}
	return res;
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	if (opts.help) {
		console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 11).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
		return;
	}
	let competitors = loadCompetitors(benchDir);
	const bad = competitors.flatMap((c) => validateContract(c).map((m) => `${c.id}: ${m}`));
	if (bad.length) {
		console.error(`bad contract:\n${bad.join("\n")}`);
		process.exit(2);
	}
	if (opts.list) {
		for (const c of competitors) {
			const missing = (c.requires ?? []).filter((r) => !have(r));
			console.log(`${c.id.padEnd(16)} ${c.name.padEnd(24)} ${missing.length ? `missing: ${missing.join(", ")}` : "ready"}`);
		}
		return;
	}
	if (opts.only) {
		const unknown = opts.only.filter((id) => !competitors.some((c) => c.id === id));
		if (unknown.length) throw new Error(`unknown competitor: ${unknown.join(", ")}`);
		competitors = competitors.filter((c) => opts.only.includes(c.id));
	}
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const outDir = path.resolve(opts.out ?? path.join(root, "bench-results", stamp));
	fs.mkdirSync(outDir, { recursive: true });
	const work = path.resolve(opts.work ?? fs.mkdtempSync(path.join(os.tmpdir(), "flisk-bench-")));
	fs.mkdirSync(work, { recursive: true });
	const git = (a) => {
		try {
			return execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
		} catch {
			return null;
		}
	};
	const results = [];
	for (const c of competitors) {
		console.error(`\n=== ${c.id} ===`);
		const r = await runOne(c, opts, { work, outDir });
		console.error(`${c.id}: ${r.status}${r.error ? ` (${r.error.split("\n")[0]})` : ""} ${JSON.stringify(r.phases)}`);
		results.push(r);
	}
	const dockerV = sh("docker version --format '{{.Server.Version}}'").out;
	const doc = {
		schema: 1,
		informational: true,
		startedAt: new Date().toISOString(),
		commit: process.env.GITHUB_SHA ?? git(["rev-parse", "HEAD"]),
		runner: { os: `${os.type()} ${os.release()}`, arch: os.arch(), cpus: os.cpus().length, memGB: Math.round(os.totalmem() / 2 ** 30), docker: dockerV, ci: Boolean(process.env.CI) },
		results,
	};
	fs.writeFileSync(path.join(outDir, "results.json"), `${JSON.stringify(doc, null, 2)}\n`);
	fs.writeFileSync(path.join(outDir, "report.md"), renderReport(doc));
	console.error(`\nwrote ${outDir}/results.json and report.md`);
	console.log(renderReport(doc));
	// Informational: a competitor that failed is a finding, not a failed run. Only a broken contract or crash exits non-zero.
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
