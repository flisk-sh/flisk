#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

// Gives the same prompt to the same headless coding agent in two fresh, empty folders: one with Flisk on PATH and the
// Flisk agent skills in .claude/skills, one without Flisk. Records time to healthy, tokens, cost, turns, hand-written
// infrastructure files, tool errors and success. See README.md next to this file.

import { spawn, spawnSync } from "node:child_process";
import {
	cpSync,
	createWriteStream,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { connect } from "node:net";
import { cpus, homedir, release, totalmem } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { classifyInfraFiles, parseStream, sanitize } from "./lib.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const today = new Date().toISOString().slice(0, 10);

const { values: args } = parseArgs({
	options: {
		prompts: { type: "string", default: "shop,ai-agent" },
		arms: { type: "string", default: "flisk,no-flisk" },
		runs: { type: "string", default: "3" },
		model: { type: "string", default: "claude-sonnet-5-5" },
		"flisk-version": { type: "string", default: "1.4.2" },
		"timeout-min": { type: "string", default: "30" },
		"budget-usd": { type: "string", default: "8" },
		workdir: { type: "string", default: join(homedir(), ".cache", "flisk-agent-bench") },
		out: {
			type: "string",
			default: join(repoRoot, "docs/benchmarks/results", `agent-with-vs-without-flisk-${today}`),
		},
		"skip-preflight": { type: "boolean", default: false },
	},
});

const promptFile = JSON.parse(readFileSync(join(scriptDir, "prompts.json"), "utf8"));
const promptIds = args.prompts.split(",");
const arms = args.arms.split(",");
const runs = Number(args.runs);
const timeoutMs = Number(args["timeout-min"]) * 60_000;
const workdir = resolve(args.workdir);
const outDir = resolve(args.out);
if (/\s/.test(workdir)) fail(`--workdir must not contain spaces (Docker and Tilt paths): ${workdir}`);

// Commands the agent may not run in either arm: they would change this machine outside the run folder.
const disallowed = [
	"Bash(sudo:*)",
	"Bash(docker system prune:*)",
	"Bash(docker volume prune:*)",
	"Bash(docker network prune:*)",
	"Bash(docker image prune:*)",
	"Bash(brew:*)",
	"Bash(npm install -g:*)",
	"Bash(npm i -g:*)",
	"Bash(bun add -g:*)",
	"Bash(bun install -g:*)",
	"WebSearch",
	"WebFetch",
];

function fail(message) {
	console.error(`agent-bench: ${message}`);
	process.exit(1);
}

function sh(cmd, argv, opts = {}) {
	const r = spawnSync(cmd, argv, { encoding: "utf8", ...opts });
	return { code: r.status, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

function which(name, path = process.env.PATH) {
	for (const dir of path.split(delimiter)) {
		const p = join(dir, name);
		if (existsSync(p)) return p;
	}
	return null;
}

// PATH for both arms: every tool on this machine except flisk and its old names (tdk*). Arm "flisk" adds one directory
// with the pinned flisk version in front.
function buildBaseBin() {
	const bin = join(workdir, "bin-base");
	mkdirSync(bin, { recursive: true });
	const hidden = /^(flisk|tdk)/;
	const sources = [...new Set(process.env.PATH.split(delimiter))].filter(
		(d) => d && !d.startsWith(bin) && existsSync(d),
	);
	for (const dir of sources) {
		if (["/usr/bin", "/bin", "/usr/sbin", "/sbin"].includes(dir)) continue;
		for (const name of readdirSync(dir)) {
			if (hidden.test(name) || existsSync(join(bin, name))) continue;
			const p = join(dir, name);
			try {
				if (!statSync(p).isFile()) continue;
				symlinkSync(realpathSync(p), join(bin, name));
			} catch {}
		}
	}
	return [bin, "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(delimiter);
}

function installFlisk(version) {
	const prefix = join(workdir, "tools", `flisk-${version}`);
	const bin = join(prefix, "node_modules", ".bin");
	if (!existsSync(join(bin, "flisk"))) {
		const r = sh("npm", ["install", "--prefix", prefix, `@flisk-sh/flisk@${version}`, "--no-fund", "--no-audit"], {
			stdio: "inherit",
		});
		if (r.code !== 0) fail(`npm install @flisk-sh/flisk@${version} failed`);
	}
	return bin;
}

// The skills a Flisk user's agent sees: every flisk-* skill except the ones for working on this repository.
function copySkills(runDir) {
	const src = join(repoRoot, ".claude/skills");
	const dest = join(runDir, ".claude/skills");
	const repoOnly = new Set(["flisk-e2e-author", "layer-autoresearch"]);
	const names = readdirSync(src).filter((n) => n.startsWith("flisk-") && !repoOnly.has(n));
	for (const n of names) cpSync(realpathSync(join(src, n)), join(dest, n), { recursive: true });
	return names.sort();
}

function dockerIds(kind) {
	const argv = kind === "containers" ? ["ps", "-aq", "--no-trunc"] : ["network", "ls", "-q", "--no-trunc"];
	return new Set(sh("docker", argv).out.split("\n").filter(Boolean));
}

function probeTcp(host, port) {
	return new Promise((res) => {
		const s = connect({ host, port, timeout: 4000 });
		s.once("connect", () => {
			s.destroy();
			res(true);
		});
		s.once("timeout", () => {
			s.destroy();
			res(false);
		});
		s.once("error", () => res(false));
	});
}

// http(s) URLs must answer 2xx; database-style URLs (postgres://, redis://, tcp://) must accept a TCP connection.
async function probe(url) {
	if (/^https?:\/\//i.test(url)) {
		const r = sh("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "-m", "5", url]);
		const status = Number(r.out) || 0;
		return { url, ok: status >= 200 && status < 300, status };
	}
	try {
		const u = new URL(url);
		const defaults = { "postgres:": 5432, "postgresql:": 5432, "redis:": 6379, "mysql:": 3306, "mongodb:": 27017 };
		const port = Number(u.port) || defaults[u.protocol];
		if (!port) return { url, ok: false, status: "unsupported-scheme" };
		const ok = await probeTcp(u.hostname === "localhost" ? "127.0.0.1" : u.hostname, port);
		return { url, ok, status: ok ? "tcp-open" : "tcp-closed" };
	} catch {
		return { url, ok: false, status: "not-a-url" };
	}
}

function readHealthUrls(runDir) {
	const f = join(runDir, "HEALTH_URLS.txt");
	if (!existsSync(f)) return null;
	return readFileSync(f, "utf8")
		.split("\n")
		.map((l) => l.trim().replace(/^[-*]\s+/, ""))
		.filter((l) => /^[a-z][a-z0-9+.-]*:\/\//i.test(l));
}

async function probeAll(urls) {
	const results = [];
	for (const u of urls) results.push(await probe(u));
	return results;
}

function processesUnder(dir) {
	const pids = sh("pgrep", ["-u", String(process.getuid())]).out.split("\n").filter(Boolean);
	const found = [];
	for (const pid of pids) {
		if (Number(pid) === process.pid) continue;
		const r = sh("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"]);
		const cwd = r.out
			.split("\n")
			.find((l) => l.startsWith("n"))
			?.slice(1);
		if (cwd && (cwd === dir || cwd.startsWith(`${dir}/`))) found.push(pid);
	}
	return found;
}

// Stop what the run started: flisk down (arm flisk), processes whose cwd is in the run folder, and the containers and
// networks created during the run. Nothing that existed before the run is touched.
function cleanup(runDir, arm, env, before) {
	const log = [];
	if (arm === "flisk" && existsSync(join(runDir, ".flisk"))) {
		const r = sh("flisk", ["down", "--prune-networks"], { cwd: runDir, env, timeout: 180_000 });
		log.push(`flisk down --prune-networks: exit ${r.code}`);
	}
	const pids = processesUnder(runDir);
	if (pids.length) {
		sh("kill", ["-TERM", ...pids]);
		log.push(`killed ${pids.length} processes`);
	}
	const newContainers = [...dockerIds("containers")].filter((id) => !before.containers.has(id));
	if (newContainers.length) {
		sh("docker", ["rm", "-f", "-v", ...newContainers]);
		log.push(`removed ${newContainers.length} containers`);
	}
	const newNetworks = [...dockerIds("networks")].filter((id) => !before.networks.has(id));
	if (newNetworks.length) {
		sh("docker", ["network", "rm", ...newNetworks]);
		log.push(`removed ${newNetworks.length} networks`);
	}
	return log;
}

async function runOne({ prompt, arm, index, env, model, skills }) {
	const id = `${prompt.id}-${arm}-${index}`;
	const runDir = join(workdir, "runs", `${id}-${Date.now()}`);
	mkdirSync(runDir, { recursive: true });
	const skillNames = arm === "flisk" ? copySkills(runDir) : [];
	const before = { containers: dockerIds("containers"), networks: dockerIds("networks") };
	const fullPrompt = prompt.text + promptFile.suffix;
	const argv = [
		"-p",
		fullPrompt,
		"--model",
		model,
		"--output-format",
		"stream-json",
		"--verbose",
		"--permission-mode",
		"bypassPermissions",
		"--setting-sources",
		"project",
		"--strict-mcp-config",
		"--no-session-persistence",
		"--max-budget-usd",
		args["budget-usd"],
		"--disallowedTools",
		...disallowed,
	];
	const rawPath = join(workdir, "raw", `${id}-${Date.now()}.jsonl`);
	mkdirSync(dirname(rawPath), { recursive: true });
	const raw = createWriteStream(rawPath);
	const stderrChunks = [];
	const started = Date.now();
	let healthyAt = null;
	let lastProbe = null;
	console.log(`\n▶ ${id}  (${runDir})`);

	const child = spawn("claude", argv, { cwd: runDir, env, stdio: ["ignore", "pipe", "pipe"] });
	child.stdout.pipe(raw);
	child.stderr.on("data", (d) => stderrChunks.push(d));
	let timedOut = false;
	const killer = setTimeout(() => {
		timedOut = true;
		child.kill("SIGTERM");
		setTimeout(() => child.kill("SIGKILL"), 10_000);
	}, timeoutMs);
	let probing = false;
	const poller = setInterval(async () => {
		if (probing || healthyAt) return;
		probing = true;
		const urls = readHealthUrls(runDir);
		if (urls && urls.length >= prompt.minServices) {
			const r = await probeAll(urls);
			lastProbe = r;
			if (r.every((x) => x.ok)) healthyAt = Date.now();
		}
		probing = false;
	}, 5000);
	const exitCode = await new Promise((res) => child.on("close", (code) => res(code)));
	const agentEnded = Date.now();
	clearTimeout(killer);
	clearInterval(poller);
	await new Promise((res) => raw.end(res));

	// Final check after the agent has exited: the app must still answer.
	const urls = readHealthUrls(runDir) ?? [];
	const finalProbe = await probeAll(urls);
	const allHealthy = urls.length >= prompt.minServices && finalProbe.every((x) => x.ok);
	if (allHealthy && !healthyAt) healthyAt = Date.now();

	const lines = readFileSync(rawPath, "utf8").split("\n").filter(Boolean);
	const parsed = parseStream(lines);
	const infra = classifyInfraFiles(parsed.writtenFiles, runDir);
	const resultOk = parsed.result && !parsed.result.is_error;
	const success = !timedOut && exitCode === 0 && resultOk && allHealthy;
	let failure = null;
	if (!success) {
		if (timedOut) failure = `timeout after ${args["timeout-min"]} min`;
		else if (!parsed.result) failure = `agent exited ${exitCode} without a result`;
		else if (parsed.result.is_error) failure = `agent error: ${String(parsed.result.result ?? parsed.result.subtype).slice(0, 200)}`;
		else if (urls.length < prompt.minServices)
			failure = `HEALTH_URLS.txt lists ${urls.length} URLs, expected at least ${prompt.minServices}`;
		else failure = `not healthy after the agent finished: ${finalProbe.filter((x) => !x.ok).map((x) => `${x.url} → ${x.status}`).join(", ")}`;
	}
	const cleanupLog = cleanup(runDir, arm, env, before);

	const metrics = {
		id,
		prompt: prompt.id,
		arm,
		run: index,
		startedAt: new Date(started).toISOString(),
		success,
		failure,
		humanHelp: false,
		timeToHealthySec: healthyAt ? (healthyAt - started) / 1000 : null,
		agentWallSec: (agentEnded - started) / 1000,
		exitCode,
		timedOut,
		model: parsed.init?.model ?? null,
		requestedModel: model,
		numTurns: parsed.result?.num_turns ?? null,
		costUsd: parsed.result?.total_cost_usd ?? null,
		tokens: parsed.tokens,
		toolCalls: parsed.toolCalls,
		toolErrors: parsed.toolErrors,
		retriesAfterError: parsed.retriesAfterError,
		infraFilesHandWritten: infra.length,
		infraFiles: infra,
		healthUrls: urls,
		finalProbe,
		lastProbeDuringRun: lastProbe,
		skillsInstalled: skillNames,
		skillsSeenByAgent: parsed.init?.skills ?? null,
		skillsInvoked: parsed.skillsInvoked,
		fliskOnPath: Boolean(which("flisk", env.PATH)),
		runDir: runDir.replace(homedir(), "~"),
		cleanup: cleanupLog,
	};
	const dest = join(outDir, "raw", id);
	mkdirSync(dest, { recursive: true });
	writeFileSync(join(dest, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
	writeFileSync(join(dest, "transcript.jsonl.gz"), gzipSync(sanitize(lines, runDir).join("\n")));
	writeFileSync(join(dest, "prompt.txt"), fullPrompt);
	const tree = sh("find", [".", "-path", "*/node_modules", "-prune", "-o", "-path", "./.git", "-prune", "-o", "-type", "f", "-print"], { cwd: runDir }).out;
	writeFileSync(join(dest, "files.txt"), `${tree.split("\n").sort().join("\n")}\n`);
	console.log(
		`  ${success ? "✔ success" : `✘ failed (${failure})`}  healthy ${metrics.timeToHealthySec ?? "-"} s  turns ${metrics.numTurns}  cost $${metrics.costUsd}  infra files ${infra.length}  tool errors ${parsed.toolErrors}`,
	);
	return metrics;
}

async function main() {
	const prompts = promptIds.map((id) => promptFile.prompts.find((p) => p.id === id) ?? fail(`unknown prompt ${id}`));
	for (const tool of ["docker", "tilt", "claude", "npm", "curl"]) if (!which(tool)) fail(`${tool} is not on PATH`);
	if (sh("docker", ["info", "--format", "{{.ServerVersion}}"]).code !== 0) fail("Docker is not running");
	mkdirSync(workdir, { recursive: true });
	const basePath = buildBaseBin();
	const fliskBin = installFlisk(args["flisk-version"]);
	// A clean environment, like `env -i`: nothing from the shell or app that started the harness (for example
	// ANTHROPIC_BASE_URL or CLAUDE_CODE_* from a desktop session) reaches the agent. USER and LOGNAME are needed for the
	// CLI's keychain sign-in lookup on macOS.
	const envFor = (arm) => ({
		HOME: homedir(),
		USER: process.env.USER ?? "",
		LOGNAME: process.env.LOGNAME ?? process.env.USER ?? "",
		SHELL: "/bin/zsh",
		TERM: "xterm",
		LANG: process.env.LANG ?? "en_US.UTF-8",
		DISABLE_AUTOUPDATER: "1",
		PATH: arm === "flisk" ? `${fliskBin}${delimiter}${basePath}` : basePath,
	});
	if (which("flisk", envFor("no-flisk").PATH)) fail("flisk is still reachable on the no-flisk PATH");
	if (!args["skip-preflight"]) {
		const r = sh("claude", ["-p", "Reply with OK.", "--model", args.model, "--output-format", "json", "--setting-sources", "project", "--no-session-persistence"], { cwd: workdir, env: envFor("no-flisk") });
		let msg = r.out;
		try {
			const j = JSON.parse(r.out);
			if (!j.is_error) msg = null;
			else msg = j.result;
		} catch {}
		if (msg) fail(`the agent cannot run: ${msg.slice(0, 300)}`);
	}

	const environment = {
		date: new Date().toISOString(),
		flisk: sh(join(fliskBin, "flisk"), ["--version"]).out,
		claude: sh("claude", ["--version"]).out,
		requestedModel: args.model,
		docker: sh("docker", ["version", "--format", "{{.Server.Version}}"]).out,
		dockerVm: sh("docker", ["info", "--format", "{{.NCPU}} CPUs, {{.MemTotal}} bytes"]).out,
		tilt: sh("tilt", ["version"]).out,
		node: process.version,
		os: `${process.platform} ${release()} ${process.arch}`,
		cpus: cpus().length,
		memoryBytes: totalmem(),
		timeoutMin: Number(args["timeout-min"]),
		budgetUsdPerRun: Number(args["budget-usd"]),
		disallowedTools: disallowed,
	};
	mkdirSync(outDir, { recursive: true });
	writeFileSync(join(outDir, "environment.json"), `${JSON.stringify(environment, null, 2)}\n`);
	console.log(environment);

	// Alternate which arm goes first so warm Docker caches do not always favour the same arm.
	for (let i = 1; i <= runs; i++) {
		for (const prompt of prompts) {
			const order = i % 2 === 1 ? arms : [...arms].reverse();
			for (const arm of order) {
				const id = `${prompt.id}-${arm}-${i}`;
				if (existsSync(join(outDir, "raw", id, "metrics.json"))) {
					console.log(`skip ${id} (already recorded)`);
					continue;
				}
				await runOne({ prompt, arm, index: i, env: envFor(arm), model: args.model });
			}
		}
	}
	const s = sh("node", [join(scriptDir, "summarize.mjs"), outDir], { stdio: "inherit" });
	process.exit(s.code ?? 0);
}

main();
