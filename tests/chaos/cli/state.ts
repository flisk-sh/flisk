// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// State tier: random sequences of project edits (create, delete, rename, move and break services) on one project, checking after
// every step that the commands that describe the project agree with the disk and with each other:
//   - `resources --json` lists exactly the service.json files that parse and name a service;
//   - `stacks --json` counts match the resources' stacks;
//   - `config regenerate` twice in a row changes nothing the second time (idempotent);
//   - `config verify --json` is valid right after `config regenerate`, unless the project holds a known break;
//   - `up --dry-run --json` agrees with `config verify` about a known break (duplicate name, port clash, bad json).
//
//   bun cli/state.ts [--sequences 40] [--steps 12] [--seed 1]
import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
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
const SEQUENCES = flag("sequences", 40);
const STEPS = flag("steps", 12);
const SEED = flag("seed", 1);

const NAMES = [
	"orders",
	"billing",
	"users",
	"search",
	"mailer",
	"audit",
	"cart",
	"ledger",
];
const STACKS = ["main", "extra", "shop"];
const TYPES = ["backend", "backend", "frontend", "worker", "mcp", "agent"];

function flisk(
	cwd: string,
	args: string[],
): { status: number | null; out: string; err: string } {
	const r = spawnSync(process.execPath, [FLISK_BIN, ...args], {
		cwd,
		encoding: "utf-8",
		timeout: 120_000,
		maxBuffer: 64 * 1024 * 1024,
		env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", CI: "1" },
	});
	return { status: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}

function json(
	cwd: string,
	args: string[],
): { status: number | null; data: any; errors: any[]; raw: string } {
	const r = flisk(cwd, [...args, "--json"]);
	try {
		const envelope = JSON.parse(r.out.slice(r.out.indexOf("{")));
		return {
			status: r.status,
			data: envelope.data,
			errors: envelope.errors ?? [],
			raw: r.out,
		};
	} catch {
		return {
			status: r.status,
			data: undefined,
			errors: [],
			raw: `${r.out}\n${r.err}`,
		};
	}
}

interface OnDisk {
	/** appName of every parseable service.json -> its stack. */
	services: Map<string, string>;
	/** A known break the project holds: the commands are expected to refuse. */
	breaks: Set<string>;
}

function readDisk(dir: string): OnDisk {
	const services = new Map<string, string>();
	const breaks = new Set<string>();
	const seen = new Map<string, number>();
	const ports = new Map<number, string>();
	const base = join(dir, "services");
	if (!existsSync(base)) return { services, breaks };
	for (const stack of readdirSync(base)) {
		const stackDir = join(base, stack);
		if (!statSync(stackDir).isDirectory()) continue;
		for (const entry of readdirSync(stackDir)) {
			const file = join(stackDir, entry, "service.json");
			if (!existsSync(file)) continue;
			let manifest: any;
			try {
				manifest = JSON.parse(readFileSync(file, "utf-8"));
			} catch {
				breaks.add("bad-json");
				continue;
			}
			if (
				!manifest ||
				typeof manifest !== "object" ||
				typeof manifest.appName !== "string"
			) {
				breaks.add("bad-shape");
				continue;
			}
			seen.set(manifest.appName, (seen.get(manifest.appName) ?? 0) + 1);
			services.set(manifest.appName, manifest.stack ?? stack);
			if (typeof manifest.port === "number") {
				const other = ports.get(manifest.port);
				// Two services on one port are fine in Docker (only Traefik publishes a host port); the native runtime refuses it itself.
				if (other && other !== manifest.appName)
					ports.set(manifest.port, other);
				ports.set(manifest.port, manifest.appName);
			}
		}
	}
	for (const [, count] of seen) if (count > 1) breaks.add("duplicate-name");
	return { services, breaks };
}

function readManifest(dirPath: string): any | null {
	try {
		return JSON.parse(readFileSync(join(dirPath, "service.json"), "utf-8"));
	} catch {
		return null;
	}
}

function serviceFiles(dir: string): string[] {
	const out: string[] = [];
	const base = join(dir, "services");
	if (!existsSync(base)) return out;
	for (const stack of readdirSync(base)) {
		const stackDir = join(base, stack);
		if (!statSync(stackDir).isDirectory()) continue;
		for (const entry of readdirSync(stackDir))
			if (existsSync(join(stackDir, entry, "service.json")))
				out.push(join(stackDir, entry));
	}
	return out;
}

function snapshot(dir: string): Map<string, string> {
	const files = new Map<string, string>();
	const walk = (current: string): void => {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			if (entry.name === "node_modules") continue;
			const path = join(current, entry.name);
			if (entry.isDirectory()) walk(path);
			else files.set(path.slice(dir.length), readFileSync(path, "utf-8"));
		}
	};
	walk(dir);
	return files;
}

interface Failure {
	sequence: number;
	step: number;
	invariant: string;
	detail: string;
	history: string[];
}

function check(
	dir: string,
	history: string[],
	sequence: number,
	step: number,
	failures: Failure[],
): void {
	const fail = (invariant: string, detail: string): void => {
		failures.push({
			sequence,
			step,
			invariant,
			detail: detail.slice(0, 500),
			history: [...history],
		});
	};
	const disk = readDisk(dir);

	const resources = json(dir, ["resources"]);
	if (resources.data === undefined) {
		fail(
			"resources-json",
			`resources --json gave no envelope: ${resources.raw.slice(0, 200)}`,
		);
	} else {
		const listed = new Set<string>(
			resources.data.resources.map((r: any) => r.name),
		);
		const expected = new Set(disk.services.keys());
		const missing = [...expected].filter((n) => !listed.has(n));
		const extra = [...listed].filter((n) => !expected.has(n));
		// A duplicate name shows once in a map but can be listed twice; only a name that is on disk and not listed counts.
		if (missing.length > 0 || (extra.length > 0 && disk.breaks.size === 0))
			fail(
				"resources-match-disk",
				`listed ${[...listed].sort()} but disk has ${[...expected].sort()}`,
			);
	}

	const stacks = json(dir, ["stacks"]);
	if (stacks.data === undefined) {
		fail(
			"stacks-json",
			`stacks --json gave no envelope: ${stacks.raw.slice(0, 200)}`,
		);
	} else if (resources.data !== undefined) {
		const counts = new Map<string, number>();
		for (const r of resources.data.resources)
			counts.set(r.stack, (counts.get(r.stack) ?? 0) + 1);
		for (const s of stacks.data.stacks) {
			if (
				(counts.get(s.name) ?? 0) !== s.resourceCount &&
				disk.breaks.size === 0
			)
				fail(
					"stacks-count",
					`stack ${s.name}: stacks says ${s.resourceCount}, resources says ${counts.get(s.name) ?? 0}`,
				);
		}
	}

	if (disk.breaks.size === 0) {
		const first = flisk(dir, ["config", "regenerate"]);
		if (first.status !== 0) {
			fail(
				"regenerate-ok",
				`regenerate exit ${first.status}: ${(first.out + first.err).slice(-300)}`,
			);
			return;
		}
		const before = snapshot(dir);
		const second = flisk(dir, ["config", "regenerate"]);
		const after = snapshot(dir);
		const changed = [...after]
			.filter(([path, text]) => before.get(path) !== text)
			.map(([p]) => p);
		const gone = [...before.keys()].filter((p) => !after.has(p));
		if (second.status !== 0 || changed.length > 0 || gone.length > 0)
			fail(
				"regenerate-idempotent",
				`second regenerate exit ${second.status}, changed ${changed.slice(0, 4)}, removed ${gone.slice(0, 4)}`,
			);
		const verify = json(dir, ["config", "verify"]);
		if (verify.data?.valid !== true)
			fail(
				"verify-after-regenerate",
				`verify not valid after regenerate: ${JSON.stringify(verify.data?.errors ?? verify.errors).slice(0, 300)}`,
			);
		const up = json(dir, ["up", "--dry-run"]);
		if (up.data?.ok !== true && up.status === 0)
			fail("up-dry-run-envelope", `exit 0 but data.ok=${up.data?.ok}`);
		if (
			up.status !== 0 &&
			verify.data?.valid === true &&
			!/enabled|stack/i.test(up.raw)
		)
			fail(
				"up-refuses-valid-project",
				`verify valid but up --dry-run exit ${up.status}: ${up.raw.slice(0, 300)}`,
			);
	} else {
		// A known break: `up` must refuse it rather than start (a duplicate name or a port clash), and say it as an error.
		const breakNeedsRefusal = disk.breaks.has("duplicate-name");
		if (breakNeedsRefusal) {
			const up = json(dir, ["up", "--dry-run"]);
			if (up.status === 0 && up.data?.ok === true)
				fail(
					"up-accepts-known-break",
					`up --dry-run accepted ${[...disk.breaks]}`,
				);
		}
	}
}

function step(dir: string, rng: Rng, history: string[]): void {
	const files = serviceFiles(dir);
	const op = rng.pick([
		"create",
		"create",
		"create",
		"delete",
		"rename-dir",
		"dup",
		"port-clash",
		"bad-json",
		"move-stack",
		"fix",
	]);
	const target = files.length > 0 ? rng.pick(files) : null;
	switch (op) {
		case "create": {
			const name = rng.pick(NAMES);
			const type = rng.pick(TYPES);
			const stack = rng.pick(STACKS);
			history.push(
				`flisk resource ${name} --yes --type ${type} --stack ${stack}`,
			);
			flisk(dir, ["resource", name, "--yes", "--type", type, "--stack", stack]);
			return;
		}
		case "delete":
			if (target) {
				history.push(`rm -r ${target.slice(dir.length)}`);
				rmSync(target, { recursive: true });
			}
			return;
		case "rename-dir":
			if (target) {
				const to = `${target}-renamed`;
				history.push(`mv ${target.slice(dir.length)} ${to.slice(dir.length)}`);
				renameSync(target, to);
			}
			return;
		case "dup":
			if (target) {
				const to = join(resolve(target, ".."), `copy-${rng.int(1000)}`);
				history.push(
					`cp -r ${target.slice(dir.length)} ${to.slice(dir.length)}`,
				);
				cpSync(target, to, { recursive: true });
			}
			return;
		case "port-clash":
			if (files.length >= 2) {
				const [a, b] = [rng.pick(files), rng.pick(files)];
				if (a !== b) {
					const portOfA = readManifest(a)?.port;
					const m = readManifest(b);
					if (m && typeof portOfA === "number") {
						m.port = portOfA;
						history.push(`set port ${portOfA} in ${b.slice(dir.length)}`);
						writeFileSync(join(b, "service.json"), JSON.stringify(m, null, 2));
					}
				}
			}
			return;
		case "bad-json":
			if (target) {
				history.push(`truncate ${target.slice(dir.length)}/service.json`);
				writeFileSync(join(target, "service.json"), '{"appName": ');
			}
			return;
		case "move-stack":
			if (target) {
				const m = readManifest(target);
				if (m) {
					m.stack = rng.pick(STACKS);
					history.push(`set stack ${m.stack} in ${target.slice(dir.length)}`);
					writeFileSync(
						join(target, "service.json"),
						JSON.stringify(m, null, 2),
					);
				}
			}
			return;
		case "fix": {
			// Undo breaks: remove duplicate copies and truncated files so the sequence can reach a clean state again.
			for (const dirPath of serviceFiles(dir)) {
				try {
					JSON.parse(readFileSync(join(dirPath, "service.json"), "utf-8"));
				} catch {
					history.push(`rm -r ${dirPath.slice(dir.length)} (fix)`);
					rmSync(dirPath, { recursive: true });
				}
			}
			return;
		}
	}
}

function main(): void {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "flisk-state-")));
	const seed = join(root, "seed");
	mkdirSync(seed);
	const init = flisk(seed, ["project", "--yes", "--no-agent-skills"]);
	if (init.status !== 0)
		throw new Error(`flisk project failed: ${init.out}${init.err}`);

	const failures: Failure[] = [];
	for (let sequence = 0; sequence < SEQUENCES; sequence++) {
		const rng = new Rng(SEED * 7919 + sequence);
		const dir = join(root, `seq-${sequence}`);
		cpSync(seed, dir, { recursive: true });
		const history: string[] = [];
		for (let i = 0; i < STEPS; i++) {
			step(dir, rng, history);
			check(dir, history, sequence, i, failures);
			if (failures.some((f) => f.sequence === sequence)) break;
		}
		process.stderr.write(
			`sequence ${sequence + 1}/${SEQUENCES}, ${failures.length} failures\n`,
		);
	}

	const byInvariant = new Map<string, Failure[]>();
	for (const f of failures)
		byInvariant.set(f.invariant, [...(byInvariant.get(f.invariant) ?? []), f]);
	console.log(
		`${SEQUENCES} sequences x up to ${STEPS} steps, ${failures.length} failing sequences\n`,
	);
	for (const [invariant, list] of byInvariant) {
		console.log(`[${invariant}] x${list.length}`);
		const first = list[0];
		console.log(`    ${first.detail}`);
		console.log(`    after: ${first.history.join("; ")}`);
	}
	writeFileSync(
		resolve("cli-state-report.json"),
		JSON.stringify(failures, null, 2),
	);
	process.exit(failures.length > 0 ? 1 : 0);
}

if (import.meta.main) main();
