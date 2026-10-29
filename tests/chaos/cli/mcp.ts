// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// MCP tier: call every `flisk mcp` tool over stdio with arguments built from its input schema and then corrupted (wrong types,
// odd strings, out-of-range numbers, missing or extra keys), against a valid project, a corrupt project.json and a missing one.
// What must hold for any input: the server stays up, every call gets exactly one JSON-RPC reply, no reply carries a runtime stack
// trace, `[object Object]`, `NaN` or an unexplained `undefined`, and a call that reports isError says why in text.
// Tools that start or stop things (up, down, resource_restart, project_init) are only run with dryRun forced on, or not at all.
//
//   bun cli/mcp.ts [--count 600] [--seed 1]
import {
	type ChildProcessWithoutNullStreams,
	spawn,
	spawnSync,
} from "node:child_process";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Rng } from "../gates/generate.js";
import { REPO_ROOT } from "../graph/project.js";

/** Reports go to the temp directory, never into the checkout (they are run output, not source). */
const reportPath = (name: string): string =>
	join(process.env.CHAOS_REPORT_DIR ?? tmpdir(), name);

const FLISK_BIN = process.env.FLISK_BIN ?? join(REPO_ROOT, "cli/bin/flisk.js");
const flag = (name: string, fallback: number): number => {
	const at = process.argv.indexOf(`--${name}`);
	return at >= 0 ? Number(process.argv[at + 1]) : fallback;
};
const COUNT = flag("count", 600);
const SEED = flag("seed", 1);

const SKIP = new Set(["resource_restart", "project_init"]);
/** Forced on so the tool cannot start, stop or write anything outside the temp project. */
const FORCE_DRY: Record<string, Record<string, unknown>> = {
	up: { dryRun: true },
	down: { dryRun: true },
	project_eject: { dryRun: true },
	project_import: { dryRun: true },
};

const STRINGS = [
	"",
	" ",
	"-",
	"--json",
	"../..",
	"orders",
	"main",
	"nosuch",
	"a b",
	"a\nb",
	"'",
	'"',
	"$(id)",
	"ünï",
	"😀",
	"ORDERS",
	"a".repeat(400),
	"null",
	"undefined",
	"backend",
	"frontend",
	"worker",
	"agent",
	"mcp",
	"sdk",
	"bring-your-own",
	"package.json",
	"service.json",
	"Tiltfile",
];
const NUMBERS: unknown[] = [
	0,
	-1,
	1,
	1.5,
	80,
	3000,
	65535,
	65536,
	1e9,
	1e21,
	"3000",
	"abc",
	null,
	NaN,
];

type Schema = {
	type?: string | string[];
	enum?: unknown[];
	items?: Schema;
	properties?: Record<string, Schema>;
};

function value(schema: Schema | undefined, rng: Rng, depth = 0): unknown {
	if (rng.chance(0.15))
		return rng.pick([null, 0, "", [], {}, true, "x", -1, 1e21]);
	const type = Array.isArray(schema?.type) ? schema?.type[0] : schema?.type;
	if (schema?.enum && rng.chance(0.7)) return rng.pick(schema.enum);
	switch (type) {
		case "string":
			return rng.pick(STRINGS);
		case "number":
		case "integer":
			return rng.pick(NUMBERS);
		case "boolean":
			return rng.chance(0.5);
		case "array": {
			const n = rng.int(3);
			return Array.from({ length: n }, () =>
				depth < 2 ? value(schema?.items, rng, depth + 1) : "x",
			);
		}
		case "object": {
			const out: Record<string, unknown> = {};
			for (const [key, sub] of Object.entries(schema?.properties ?? {}))
				if (rng.chance(0.5)) out[key] = value(sub, rng, depth + 1);
			return out;
		}
		default:
			return rng.pick(STRINGS);
	}
}

interface Tool {
	name: string;
	inputSchema?: { properties?: Record<string, Schema>; required?: string[] };
}

class Server {
	private child: ChildProcessWithoutNullStreams;
	private buffer = "";
	private waiting = new Map<number, (message: any) => void>();
	private nextId = 1;
	alive = true;
	stderr = "";

	constructor(cwd: string, env: NodeJS.ProcessEnv) {
		this.child = spawn(process.execPath, [FLISK_BIN, "mcp"], { cwd, env });
		this.child.stdout.on("data", (chunk) => {
			this.buffer += chunk;
			let newline = this.buffer.indexOf("\n");
			while (newline >= 0) {
				const line = this.buffer.slice(0, newline);
				this.buffer = this.buffer.slice(newline + 1);
				try {
					const message = JSON.parse(line);
					this.waiting.get(message.id)?.(message);
				} catch {
					// a non-JSON line on the protocol stream is itself a finding, recorded by the caller through `noise`
					this.noise.push(line.slice(0, 200));
				}
				newline = this.buffer.indexOf("\n");
			}
		});
		this.child.stderr.on("data", (chunk) => {
			this.stderr += chunk;
		});
		this.child.on("close", () => {
			this.alive = false;
			for (const done of this.waiting.values()) done({ closed: true });
		});
	}

	noise: string[] = [];

	request(method: string, params: unknown, timeoutMs = 60_000): Promise<any> {
		const id = this.nextId++;
		return new Promise((done) => {
			const timer = setTimeout(() => {
				this.waiting.delete(id);
				done({ timeout: true });
			}, timeoutMs);
			this.waiting.set(id, (message) => {
				clearTimeout(timer);
				this.waiting.delete(id);
				done(message);
			});
			this.child.stdin.write(
				`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
			);
		});
	}

	notify(method: string): void {
		this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
	}

	stop(): void {
		this.child.kill("SIGKILL");
	}
}

const TRACE =
	/(^\s+at\s.+\(.+:\d+:\d+\)|^\s+at\s.+:\d+:\d+$|node:internal|\b(TypeError|ReferenceError|RangeError):|ERR_UNHANDLED|Bun v\d)/m;
const GARBAGE = /\[object Object\]|\bNaN\b|\bundefined\b/;

const normalise = (text: string): string =>
	text
		.replace(/flisk-mcp-[A-Za-z0-9]+/g, "<ws>")
		.replace(/["'`][^"'`\n]{0,80}["'`]/g, "<str>")
		.replace(/\d+/g, "N")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 110);

interface Bucket {
	key: string;
	tool: string;
	oracle: string;
	count: number;
	state: string;
	args: unknown;
	evidence: string;
}

async function main(): Promise<void> {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "flisk-mcp-")));
	const home = join(root, "home");
	mkdirSync(home);
	const env = {
		...process.env,
		HOME: home,
		NO_COLOR: "1",
		FORCE_COLOR: "0",
		CI: "1",
	};
	const seed = join(root, "seed");
	mkdirSync(seed);
	const run = (args: string[]): void => {
		const r = spawnSync(process.execPath, [FLISK_BIN, ...args], {
			cwd: seed,
			env,
			encoding: "utf-8",
		});
		if (r.status !== 0) throw new Error(`flisk ${args.join(" ")}: ${r.stderr}`);
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

	const states = ["valid", "corrupt", "missing"] as const;
	const buckets = new Map<string, Bucket>();
	let total = 0;
	const record = (
		tool: string,
		oracle: string,
		state: string,
		args: unknown,
		evidence: string,
	): void => {
		const key = `${tool}|${oracle}|${normalise(evidence)}`;
		const bucket = buckets.get(key);
		if (bucket) bucket.count++;
		else
			buckets.set(key, {
				key,
				tool,
				oracle,
				count: 1,
				state,
				args,
				evidence: evidence.replace(/\s+/g, " ").slice(0, 240),
			});
	};

	for (const state of states) {
		const dir = join(root, `project-${state}`);
		if (state === "missing") mkdirSync(dir);
		else cpSync(seed, dir, { recursive: true });
		if (state === "corrupt")
			writeFileSync(join(dir, ".flisk/project.json"), "{");

		let server = new Server(dir, env);
		await server.request("initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "chaos", version: "1" },
		});
		server.notify("notifications/initialized");
		const listed = await server.request("tools/list", {});
		const tools: Tool[] = (listed.result?.tools ?? []).filter(
			(tool: Tool) => !SKIP.has(tool.name),
		);
		if (tools.length === 0)
			throw new Error(
				`no tools listed: ${JSON.stringify(listed).slice(0, 200)}`,
			);

		const rng = new Rng(SEED * 4099 + states.indexOf(state));
		for (let i = 0; i < COUNT / states.length; i++) {
			const tool = rng.pick(tools);
			const args: Record<string, unknown> = {};
			for (const [key, schema] of Object.entries(
				tool.inputSchema?.properties ?? {},
			)) {
				if (key === "projectPath") {
					// Always inside the temp workspace: an arbitrary path could be written to by resource_create or stack_assign.
					if (rng.chance(0.8)) args[key] = dir;
					else if (rng.chance(0.5)) args[key] = join(dir, "nosuch");
					continue;
				}
				if (key === "dir" || key === "path") {
					args[key] = rng.chance(0.5)
						? dir
						: join(
								dir,
								rng.pick([
									"services",
									"nosuch",
									".flisk",
									"services/main/orders",
								]),
							);
					continue;
				}
				if (rng.chance(0.55) || tool.inputSchema?.required?.includes(key))
					args[key] = value(schema, rng);
			}
			if (rng.chance(0.1))
				args[rng.pick(["extra", "__proto__", "constructor"])] =
					rng.pick(STRINGS);
			Object.assign(args, FORCE_DRY[tool.name] ?? {});

			total++;
			const reply = await server.request("tools/call", {
				name: tool.name,
				arguments: args,
			});
			if (reply.timeout) {
				record(tool.name, "timeout", state, args, "no reply in 60s");
				server.stop();
			} else if (reply.closed || !server.alive) {
				record(
					tool.name,
					"server-died",
					state,
					args,
					server.stderr.split("\n").filter(Boolean).slice(-3).join(" | "),
				);
			} else {
				const text = JSON.stringify(
					reply.result?.content ?? reply.error ?? reply,
				);
				const trace = TRACE.exec(text.replace(/\\n/g, "\n"));
				if (trace)
					record(
						tool.name,
						"stack-trace",
						state,
						args,
						text.slice(Math.max(0, trace.index - 60), trace.index + 160),
					);
				const garbage = GARBAGE.exec(text);
				// A value the caller sent can be echoed back ("Unknown stack 'undefined'"); only a bare one counts.
				if (garbage && !JSON.stringify(args).includes(garbage[0]))
					record(
						tool.name,
						"garbage-text",
						state,
						args,
						text.slice(Math.max(0, garbage.index - 60), garbage.index + 60),
					);
				if (
					reply.result?.isError &&
					!String(reply.result.content?.[0]?.text ?? "").trim()
				)
					record(
						tool.name,
						"error-without-message",
						state,
						args,
						JSON.stringify(reply.result),
					);
				if (!reply.result && !reply.error)
					record(
						tool.name,
						"no-result-or-error",
						state,
						args,
						JSON.stringify(reply).slice(0, 200),
					);
			}
			if (server.noise.length > 0)
				record(
					tool.name,
					"protocol-noise",
					state,
					args,
					server.noise.splice(0).join(" | "),
				);
			if (!server.alive || reply.timeout) {
				server = new Server(dir, env);
				await server.request("initialize", {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: { name: "chaos", version: "1" },
				});
				server.notify("notifications/initialized");
			}
			if (total % 50 === 0)
				process.stderr.write(
					`${total}/${COUNT} calls, ${buckets.size} distinct findings\n`,
				);
		}
		server.stop();
	}

	const sorted = [...buckets.values()].sort(
		(a, b) => a.tool.localeCompare(b.tool) || b.count - a.count,
	);
	console.log(
		`${total} tool calls, ${sorted.length} distinct findings (seed ${SEED})\n`,
	);
	for (const bucket of sorted) {
		console.log(
			`[${bucket.tool}] ${bucket.oracle} x${bucket.count}  (${bucket.state})`,
		);
		console.log(`    ${JSON.stringify(bucket.args).slice(0, 220)}`);
		console.log(`    ${bucket.evidence}`);
	}
	writeFileSync(
		reportPath("cli-mcp-report.json"),
		JSON.stringify(sorted, null, 2),
	);
	process.exit(sorted.length > 0 ? 1 : 0);
}

if (import.meta.main) await main();
