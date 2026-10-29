// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// CLI tier: run every command that is safe to run offline with random arguments against several project states (none, valid,
// corrupt project.json, corrupt service.json) and check what must hold for ANY input, whatever the command is meant to do:
//   - it ends (no hang, no signal) with exit code 0, 1 or 2;
//   - it prints no stack trace or raw runtime error (a FliskError message is fine, an unhandled TypeError is a bug);
//   - with --json, stdout ends in one JSON envelope { schemaVersion, data, errors } that agrees with the exit code;
//   - its text never contains "[object Object]", "undefined" or "NaN" where a value should be.
// Distinct failures are bucketed by command + oracle + a normalised first line, each bucket keeps one reproduction.
//
//   bun cli/fuzz.ts [--count 3000] [--jobs 8] [--seed 1] [--only status]
//
// Commands that start servers, open a browser, stop real processes or write outside the project (up without --dry-run, down,
// open, ui, os, mcp, upgrade, completion --install) are not run. HOME is a temp directory.
import { spawn, spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Rng } from "../gates/generate.js";
import { REPO_ROOT } from "../graph/project.js";

const FLISK_BIN = process.env.FLISK_BIN ?? join(REPO_ROOT, "cli/bin/flisk.js");
const flag = (name: string, fallback: string): string => {
	const at = process.argv.indexOf(`--${name}`);
	return at >= 0 ? (process.argv[at + 1] ?? fallback) : fallback;
};
const COUNT = Number(flag("count", "3000"));
const JOBS = Number(flag("jobs", "8"));
const SEED = Number(flag("seed", "1"));
const ONLY = flag("only", "");
const TIMEOUT_MS = Number(flag("timeout", "30000"));

interface Command {
	name: string;
	/** Always added: keeps a command harmless (a dry run, no installing). */
	fixed?: string[];
	/** Flags this command knows, tried with values. */
	flags?: string[];
	/** Subcommands to pick from. */
	subs?: string[];
}

const COMMANDS: Command[] = [
	{
		name: "project",
		fixed: ["--yes", "--no-agent-skills"],
		flags: ["--name", "--force"],
	},
	{ name: "projects" },
	{ name: "import", fixed: ["--dry-run"], flags: ["--yes"] },
	{ name: "eject", fixed: ["--dry-run"], flags: ["--yes"] },
	{ name: "stacks", flags: ["--services", "--json", "--verbose"] },
	{
		name: "resource",
		fixed: ["--yes"],
		flags: ["--type", "--stack", "--port", "--language"],
	},
	{ name: "resources", flags: ["--stack", "--ports", "--json", "--type"] },
	{
		name: "agent",
		subs: ["sessions", "list"],
		flags: ["--session-id", "--watch", "--json"],
	},
	{
		name: "up",
		fixed: ["--dry-run", "--json"],
		flags: ["--only", "--focus", "--no-open"],
	},
	{ name: "restart", flags: ["--json"] },
	{ name: "status", flags: ["--json", "--verbose"] },
	{ name: "logs", flags: ["--json", "--lines", "--since", "--service"] },
	{ name: "networks", flags: ["--stack", "--json"] },
	{
		name: "config",
		subs: ["regenerate", "verify", "explain"],
		flags: ["--json", "--check"],
	},
	{ name: "doctor", flags: ["--json", "--fix"] },
	{
		name: "connect",
		fixed: ["--dry-run"],
		subs: ["claude", "cursor", "codex"],
	},
	{ name: "runtime", flags: ["--check-assets", "--json"] },
	{ name: "completion", flags: ["--shell"] },
	{ name: "version" },
	{
		name: "help",
		subs: ["up", "status", "resource", "stack", "config", "nosuch"],
	},
];

const TOKENS = [
	"",
	" ",
	"-",
	"--",
	"---",
	"-1",
	"0",
	"1e9",
	"99999999999999999999",
	"NaN",
	"null",
	"undefined",
	"true",
	"[]",
	"{}",
	"../..",
	"..",
	".",
	"/",
	"/etc/passwd",
	"~",
	"$HOME",
	"$(id)",
	"`id`",
	"a b",
	"a\nb",
	"a\tb",
	"'",
	'"',
	"\\",
	"ünï",
	"😀",
	"ORDERS",
	"a".repeat(300),
	"a".repeat(5000),
	"orders",
	"main",
	"nosuch",
	"--json",
	"--yes",
	"--dry-run",
	"--verbose",
	"--nosuchflag",
	"-h",
	"--help",
	"-v",
	"--stack",
	"--type",
	"--port",
	"backend",
	"frontend",
	"worker",
	"agent",
	"mcp",
	"library",
	"3000",
	"80",
	"65536",
];

type State = "none" | "valid" | "projectjson" | "service" | "services-dir";

const STATES: State[] = [
	"none",
	"valid",
	"valid",
	"valid",
	"projectjson",
	"service",
	"services-dir",
];

const CORRUPT_PROJECT = [
	"",
	"{",
	"[]",
	"null",
	"7",
	'"x"',
	"{}",
	'{"version":1}',
	'{"version":"1.0","project":null}',
	'{"version":"1.0","project":{"name":"x","version":"1"},"phases":[]}',
	'{"version":"1.0","project":{"name":"x","version":"1"},"phases":{"pre_alpha":{"enabledStacks":"main"}}}',
	'{"version":"1.0","project":{"name":"x","version":"1"},"phases":{"pre_alpha":{"enabledStacks":[1]},"alpha":{"enabledStacks":[]},"beta":{"enabledStacks":[]},"out_of_scope":{"enabledStacks":[]}},"optional_infra":{},"discovery":{"paths":"services/*/*"}}',
	`{"a":"${"x".repeat(200000)}"}`,
	"\u0000\u0000",
	"﻿{}",
];
const CORRUPT_SERVICE = [
	"",
	"{",
	"[]",
	"null",
	"7",
	'"x"',
	"{}",
	'{"appName":7}',
	'{"appName":"orders","dependsOn":{"a":1},"port":"x","stack":["a"]}',
	'{"appName":"orders","appType":"backend","stack":"main","schemaVersion":1,"env":"x","build":7}',
	`{"appName":"${"a".repeat(100000)}"}`,
	"\u0000",
	'{"__proto__":{"x":1},"appName":"orders"}',
];

let workspaceRoot = "";
let seedProject = "";

function scaffold(): void {
	workspaceRoot = realpathSync(mkdtempSync(join(tmpdir(), "flisk-fuzz-")));
	seedProject = join(workspaceRoot, "seed");
	mkdirSync(seedProject);
	const env = {
		...process.env,
		HOME: join(workspaceRoot, "home"),
		NO_COLOR: "1",
	};
	mkdirSync(env.HOME, { recursive: true });
	const run = (args: string[]): void => {
		const result = spawnSync(process.execPath, [FLISK_BIN, ...args], {
			cwd: seedProject,
			env,
			encoding: "utf-8",
		});
		if (result.status !== 0)
			throw new Error(`flisk ${args.join(" ")}: ${result.stderr}`);
	};
	run(["project", "--yes", "--no-agent-skills"]);
	run(["resource", "orders", "--yes", "--type", "backend", "--stack", "main"]);
	run([
		"resource",
		"storefront",
		"--yes",
		"--type",
		"frontend",
		"--stack",
		"main",
	]);
}

function stateDir(state: State, index: number, rng: Rng): string {
	const dir = join(workspaceRoot, `run-${index}`);
	if (state === "none") {
		mkdirSync(dir);
		return dir;
	}
	cpSync(seedProject, dir, { recursive: true });
	if (state === "projectjson") {
		writeFileSync(join(dir, ".flisk/project.json"), rng.pick(CORRUPT_PROJECT));
	} else if (state === "service") {
		const files = findServiceJson(dir);
		if (files.length > 0)
			writeFileSync(rng.pick(files), rng.pick(CORRUPT_SERVICE));
	} else if (state === "services-dir") {
		// A file where a service directory should be, and an empty service directory.
		const base = join(dir, "services/main");
		if (existsSync(base)) {
			mkdirSync(join(base, "empty"), { recursive: true });
			writeFileSync(join(base, "stray.txt"), "x");
		}
	}
	return dir;
}

function findServiceJson(dir: string): string[] {
	const found: string[] = [];
	const walk = (current: string): void => {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			if (entry.name === "node_modules" || entry.name === ".flisk") continue;
			const path = join(current, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (entry.name === "service.json") found.push(path);
		}
	};
	walk(join(dir, "services"));
	return found;
}

function makeArgs(rng: Rng): { command: Command; args: string[] } {
	const pool = ONLY
		? COMMANDS.filter((command) => command.name === ONLY)
		: COMMANDS;
	const command = rng.pick(pool);
	const args = [command.name];
	if (command.subs && rng.chance(0.7)) args.push(rng.pick(command.subs));
	const extra = rng.int(4);
	for (let i = 0; i < extra; i++) {
		if (command.flags && rng.chance(0.5)) {
			args.push(rng.pick(command.flags));
			if (rng.chance(0.7)) args.push(rng.pick(TOKENS));
		} else {
			args.push(rng.pick(TOKENS));
		}
	}
	if (rng.chance(0.25)) args.push("--json");
	args.push(...(command.fixed ?? []));
	return { command, args };
}

interface Finding {
	oracle: string;
	evidence: string;
}

const TRACE =
	/(^\s+at\s.+\(.+:\d+:\d+\)|^\s+at\s.+:\d+:\d+$|node:internal|\b(TypeError|ReferenceError|RangeError):|Unhandled|ERR_UNHANDLED|panic:|SyntaxError: Unexpected)/m;
const GARBAGE = /\[object Object\]|\bNaN\b|\bundefined\b(?! behavior)/;

function lastJson(text: string): unknown {
	const lines = text.trim().split("\n");
	for (let start = lines.length - 1; start >= 0; start--) {
		if (!lines[start].startsWith("{")) continue;
		try {
			return JSON.parse(lines.slice(start).join("\n"));
		} catch {
			// keep looking for an earlier start
		}
	}
	return undefined;
}

const BOOLEAN_FLAGS = new Set([
	"--json",
	"--yes",
	"--dry-run",
	"--verbose",
	"--services",
	"--watch",
	"--force",
	"--fix",
	"--check",
	"--ports",
	"--check-assets",
	"--no-open",
	"--no-agent-skills",
]);

/** True when a --json is the value of the option before it (`--stack --json`), which is not a request for JSON. */
function jsonSwallowed(args: string[]): boolean {
	const flagged = args.some(
		(arg, i) =>
			arg === "--json" &&
			!(
				i > 0 &&
				args[i - 1].startsWith("--") &&
				!BOOLEAN_FLAGS.has(args[i - 1])
			),
	);
	return !flagged;
}

function judge(
	args: string[],
	status: number | null,
	signal: string | null,
	out: string,
	err: string,
): Finding[] {
	const findings: Finding[] = [];
	const all = `${out}\n${err}`;
	// 127: npx or another helper is not installed on this machine; -v, -h and help print text on purpose.
	if (status === 127) return findings;
	const prints = args.some((arg) =>
		["-v", "--version", "-h", "--help", "help", "version"].includes(arg),
	);
	if (signal) findings.push({ oracle: "killed", evidence: `signal ${signal}` });
	else if (status !== 0 && status !== 1 && status !== 2)
		findings.push({ oracle: "exit-code", evidence: `exit ${status}` });
	const trace = TRACE.exec(all);
	if (trace)
		findings.push({
			oracle: "stack-trace",
			evidence: all.slice(Math.max(0, trace.index - 80), trace.index + 160),
		});
	const garbage = GARBAGE.exec(all);
	// A word the user typed is echoed back in "unknown argument" errors; only a value Flisk produced counts.
	if (garbage && !args.some((arg) => arg.includes(garbage[0])))
		findings.push({
			oracle: "garbage-text",
			evidence: all.slice(Math.max(0, garbage.index - 60), garbage.index + 60),
		});
	// exit 2 with a usage screen is how a command says "invalid arguments"; `runtime --check-assets --json` keeps its legacy shape.
	const usageScreen = status === 2 && out.trimStart().startsWith("Usage:");
	if (
		args.includes("--json") &&
		!jsonSwallowed(args) &&
		!prints &&
		!usageScreen &&
		args[0] !== "runtime"
	) {
		const envelope = lastJson(out) as Record<string, unknown> | undefined;
		let whole = false;
		try {
			JSON.parse(out);
			whole = true;
		} catch {
			// not one document
		}
		if (envelope !== undefined && !whole)
			findings.push({
				oracle: "json-stdout-polluted",
				evidence: out.trim().split("\n")[0].slice(0, 160),
			});
		if (envelope === undefined) {
			if (out.trim() !== "" || status === 0)
				findings.push({
					oracle: "json-unparseable",
					evidence: out.slice(0, 200) || "(empty stdout)",
				});
		} else {
			if (typeof envelope.schemaVersion !== "number" || !("errors" in envelope))
				findings.push({
					oracle: "json-shape",
					evidence: JSON.stringify(envelope).slice(0, 200),
				});
			else {
				const errors = envelope.errors as unknown[];
				if (status === 0 && Array.isArray(errors) && errors.length > 0)
					findings.push({
						oracle: "json-exit-mismatch",
						evidence: `exit 0 with errors ${JSON.stringify(errors).slice(0, 160)}`,
					});
				if (
					status === 1 &&
					Array.isArray(errors) &&
					errors.length === 0 &&
					args[0] !== "doctor"
				)
					findings.push({
						oracle: "json-exit-mismatch",
						evidence: "exit 1 with no errors in the envelope",
					});
			}
		}
	}
	return findings;
}

const normalise = (text: string): string =>
	text
		.replace(/flisk-fuzz-[A-Za-z0-9]+/g, "<ws>")
		.replace(/run-\d+/g, "run-N")
		.replace(/["'`][^"'`\n]{0,80}["'`]/g, "<str>")
		.replace(/\d+/g, "N")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 110);

interface Bucket {
	key: string;
	command: string;
	oracle: string;
	count: number;
	state: State;
	argv: string[];
	evidence: string;
}

function runOne(
	dir: string,
	args: string[],
): Promise<{
	status: number | null;
	signal: string | null;
	out: string;
	err: string;
}> {
	return new Promise((done) => {
		const child = spawn(process.execPath, [FLISK_BIN, ...args], {
			cwd: dir,
			env: {
				...process.env,
				HOME: join(workspaceRoot, "home"),
				NO_COLOR: "1",
				FORCE_COLOR: "0",
				CI: "1",
			},
			stdio: ["ignore", "pipe", "pipe"],
		});
		let out = "";
		let err = "";
		child.stdout.on("data", (d) => {
			if (out.length < 400_000) out += d;
		});
		child.stderr.on("data", (d) => {
			if (err.length < 400_000) err += d;
		});
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, TIMEOUT_MS);
		child.on("close", (status, signal) => {
			clearTimeout(timer);
			done({ status, signal: timedOut ? "TIMEOUT" : signal, out, err });
		});
		child.on("error", (e) => {
			clearTimeout(timer);
			done({ status: 127, signal: null, out: "", err: String(e) });
		});
	});
}

async function main(): Promise<void> {
	scaffold();
	const buckets = new Map<string, Bucket>();
	let next = 0;
	let done = 0;
	const started = Date.now();
	const lane = async (): Promise<void> => {
		for (let index = next++; index < COUNT; index = next++) {
			const rng = new Rng(SEED * 1_000_003 + index);
			const state = rng.pick(STATES);
			const { command, args } = makeArgs(rng);
			const dir = stateDir(state, index, rng);
			const result = await runOne(dir, args);
			for (const finding of judge(
				args,
				result.status,
				result.signal,
				result.out,
				result.err,
			)) {
				const key = `${command.name}|${finding.oracle}|${normalise(finding.evidence)}`;
				const bucket = buckets.get(key);
				if (bucket) bucket.count++;
				else
					buckets.set(key, {
						key,
						command: command.name,
						oracle: finding.oracle,
						count: 1,
						state,
						argv: args,
						evidence: finding.evidence.replace(/\s+/g, " ").slice(0, 240),
					});
			}
			done++;
			if (done % 200 === 0)
				process.stderr.write(
					`${done}/${COUNT} runs, ${buckets.size} distinct findings, ${Math.round((Date.now() - started) / 1000)}s\n`,
				);
		}
	};
	await Promise.all(Array.from({ length: JOBS }, lane));

	const sorted = [...buckets.values()].sort(
		(a, b) => a.command.localeCompare(b.command) || b.count - a.count,
	);
	console.log(
		`${COUNT} runs, ${sorted.length} distinct findings (seed ${SEED})\n`,
	);
	for (const bucket of sorted) {
		console.log(
			`[${bucket.command}] ${bucket.oracle} x${bucket.count}  (${bucket.state})`,
		);
		console.log(
			`    flisk ${bucket.argv.map((a) => JSON.stringify(a.length > 60 ? `${a.slice(0, 60)}...` : a)).join(" ")}`,
		);
		console.log(`    ${bucket.evidence}`);
	}
	writeFileSync(
		resolve("cli-fuzz-report.json"),
		JSON.stringify(sorted, null, 2),
	);
	process.exit(sorted.length > 0 ? 1 : 0);
}

if (import.meta.main) await main();
