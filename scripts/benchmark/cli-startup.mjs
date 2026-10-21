#!/usr/bin/env node
// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { cpus, release, tmpdir, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(scriptDir, "../../cli/bin/flisk.js");
const builtCliPath = resolve(scriptDir, "../../cli/dist/cli.js");
const resultsDir = resolve(scriptDir, "../../benchmarks/results");
const { values } = parseArgs({
	options: {
		help: { type: "boolean", short: "h" },
		sizes: { type: "string", default: "10,100,500" },
		runs: { type: "string", default: "10" },
		warmup: { type: "string", default: "1" },
		"timeout-ms": { type: "string", default: "60000" },
		"temp-dir": { type: "string" },
		output: { type: "string" },
		"skip-status": { type: "boolean", default: false },
	},
	allowPositionals: false,
});

if (values.help) {
	console.log(`Usage: node scripts/benchmark/cli-startup.mjs [options]

Options:
  --sizes <list>       Comma-separated service counts (default: 10,100,500)
  --runs <count>       Measured runs per command and size (default: 10)
  --warmup <count>     Warm-up runs per command and size (default: 1)
  --timeout-ms <ms>    Per-command timeout (default: 60000)
  --temp-dir <path>    Parent directory for temporary fixtures and child temp files
  --output <path>      JSON result path (default: benchmarks/results/)
  --skip-status        Omit the probe-bound status command
  -h, --help           Show this help`);
	process.exit(0);
}

function integerOption(name, value, minimum) {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < minimum) {
		throw new Error(`--${name} must be an integer >= ${minimum}`);
	}
	return parsed;
}

const sizes = [
	...new Set(values.sizes.split(",").map((value) => Number(value.trim()))),
];
if (
	!sizes.length ||
	sizes.some((size) => !Number.isSafeInteger(size) || size < 1)
) {
	throw new Error(
		"--sizes must be a comma-separated list of positive integers",
	);
}
const runs = integerOption("runs", values.runs, 1);
const warmupCount = integerOption("warmup", values.warmup, 0);
const timeoutMs = integerOption("timeout-ms", values["timeout-ms"], 1);
const allCommands = [
	{ label: "tdk version", args: ["version"] },
	{ label: "tdk --help", args: ["--help"] },
	{ label: "tdk resources", args: ["resources"] },
	{ label: "tdk stacks", args: ["stacks"] },
	{ label: "tdk status", args: ["status"] },
];
const commands = values["skip-status"]
	? allCommands.filter((command) => command.label !== "tdk status")
	: allCommands;

function roundMs(value) {
	return Math.round(value * 1000) / 1000;
}

function median(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[middle - 1] + sorted[middle]) / 2
		: sorted[middle];
}

function makeFixture(projectRoot, serviceCount) {
	const configDir = join(projectRoot, ".tdk");
	mkdirSync(configDir, { recursive: true });
	const project = {
		version: "1.0",
		project: { name: "cli-startup-benchmark", version: "1.0.0" },
		phases: {
			pre_alpha: {
				name: "Pre-Alpha",
				description: "Benchmark fixture",
				enabledStacks: ["bench"],
			},
			alpha: {
				name: "Alpha",
				description: "Benchmark fixture",
				enabledStacks: [],
			},
			beta: {
				name: "Beta",
				description: "Benchmark fixture",
				enabledStacks: [],
			},
			out_of_scope: {
				name: "Out of Scope",
				description: "Benchmark fixture",
				enabledStacks: [],
			},
		},
		optional_infra: {
			monitoring: false,
			elk: false,
			debezium: false,
			golden_image: true,
			verdaccio: false,
		},
		discovery: { paths: ["services/*/*"] },
		overrides: {},
	};
	writeFileSync(
		join(configDir, "project.json"),
		`${JSON.stringify(project, null, 2)}\n`,
	);

	for (let index = 1; index <= serviceCount; index += 1) {
		const serviceName = `service-${String(index).padStart(4, "0")}`;
		const serviceDir = join(projectRoot, "services", "bench", serviceName);
		mkdirSync(serviceDir, { recursive: true });
		const manifest = {
			schemaVersion: 1,
			appName: `bench-${serviceName}`,
			appType: "backend",
			stack: "bench",
		};
		writeFileSync(
			join(serviceDir, "service.json"),
			`${JSON.stringify(manifest, null, 2)}\n`,
		);
	}
}

function runCommand(args, cwd, tempRoot, timeoutMs) {
	const started = process.hrtime.bigint();
	const result = spawnSync(process.execPath, [cliPath, ...args], {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			TMP: tempRoot,
			TEMP: tempRoot,
			TMPDIR: tempRoot,
			NO_COLOR: "1",
		},
		maxBuffer: 16 * 1024 * 1024,
		timeout: timeoutMs,
		windowsHide: true,
	});
	const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
	if (result.error || result.status !== 0) {
		const reason = result.error?.message ?? `exit code ${result.status}`;
		const detail = [result.stdout, result.stderr]
			.filter(Boolean)
			.join("\n")
			.trim();
		throw new Error(
			`${args.join(" ")} failed in ${cwd} (${reason})${detail ? `\n${detail}` : ""}`,
		);
	}
	return roundMs(elapsedMs);
}

function summarize(command, serviceCount, samplesMs, warmupSamplesMs) {
	return {
		services: serviceCount,
		command,
		runs: samplesMs.length,
		warmupSamplesMs,
		medianMs: roundMs(median(samplesMs)),
		minMs: roundMs(Math.min(...samplesMs)),
		maxMs: roundMs(Math.max(...samplesMs)),
		samplesMs,
	};
}

function validateFixture(projectRoot, tempRoot, serviceCount) {
	const env = {
		...process.env,
		TMP: tempRoot,
		TEMP: tempRoot,
		TMPDIR: tempRoot,
		NO_COLOR: "1",
	};
	for (const [args, field] of [
		[["resources", "--json"], "resources"],
		[["stacks", "--json"], "stacks"],
	]) {
		const result = spawnSync(process.execPath, [cliPath, ...args], {
			cwd: projectRoot,
			encoding: "utf8",
			env,
			maxBuffer: 16 * 1024 * 1024,
			timeout: timeoutMs,
			windowsHide: true,
		});
		if (result.error || result.status !== 0) {
			const detail = [result.stdout, result.stderr]
				.filter(Boolean)
				.join("\n")
				.trim();
			throw new Error(
				`fixture check (${args.join(" ")}) failed${detail ? `\n${detail}` : ""}`,
			);
		}
		let envelope;
		try {
			envelope = JSON.parse(result.stdout);
		} catch {
			throw new Error(
				`fixture check (${args.join(" ")}) did not return valid JSON`,
			);
		}
		const data = envelope?.data ?? envelope;
		const items = data?.[field];
		if (!Array.isArray(items)) {
			throw new Error(
				`fixture check (${args.join(" ")}) returned no ${field} list`,
			);
		}
		if (field === "resources" && items.length !== serviceCount) {
			throw new Error(
				`fixture expected ${serviceCount} resources but discovered ${items.length}`,
			);
		}
		if (
			field === "stacks" &&
			!items.some(
				(stack) =>
					stack.name === "bench" && stack.resourceCount === serviceCount,
			)
		) {
			throw new Error(
				`fixture expected stack bench with ${serviceCount} resources`,
			);
		}
	}
}

function printTable(rows) {
	const headers = [
		"Services",
		"Command",
		"Runs",
		"Median ms",
		"Min ms",
		"Max ms",
	];
	const values = rows.map((row) =>
		[
			row.services,
			row.command === "tdk status"
				? "tdk status (probe-dominated)"
				: row.command,
			row.runs,
			row.medianMs,
			row.minMs,
			row.maxMs,
		].map(String),
	);
	const widths = headers.map((header, index) =>
		Math.max(header.length, ...values.map((row) => row[index].length)),
	);
	const border = `+${widths.map((width) => "-".repeat(width + 2)).join("+")}+`;
	const formatRow = (cells) =>
		`| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`;

	console.log(border);
	console.log(formatRow(headers));
	console.log(border);
	for (const row of values) console.log(formatRow(row));
	console.log(border);
}
function main() {
	if (!existsSync(builtCliPath)) {
		throw new Error(
			"Built CLI output is missing. Run npm.cmd run build --prefix cli in Windows PowerShell, or npm run build --prefix cli elsewhere, from the repository root.",
		);
	}
	const tempBase = resolve(values["temp-dir"] ?? tmpdir());
	mkdirSync(tempBase, { recursive: true });
	const tempRoot = mkdtempSync(join(tempBase, "tdk-cli-startup-"));
	const results = [];
	try {
		for (const serviceCount of sizes) {
			const projectRoot = join(tempRoot, `project-${serviceCount}`);
			mkdirSync(projectRoot, { recursive: true });
			makeFixture(projectRoot, serviceCount);
			validateFixture(projectRoot, tempRoot, serviceCount);

			for (const command of commands) {
				const warmupSamplesMs = [];
				for (let run = 0; run < warmupCount; run += 1) {
					warmupSamplesMs.push(
						runCommand(command.args, projectRoot, tempRoot, timeoutMs),
					);
				}
				const samplesMs = [];
				for (let run = 0; run < runs; run += 1) {
					samplesMs.push(
						runCommand(command.args, projectRoot, tempRoot, timeoutMs),
					);
				}
				const row = summarize(
					command.label,
					serviceCount,
					samplesMs,
					warmupSamplesMs,
				);
				results.push(row);
				console.log(`Completed ${serviceCount} services: ${command.label}`);
			}
		}

		printTable(results);
		const cpuList = cpus();
		const resultDocument = {
			date: new Date().toISOString(),
			runtime: {
				platform: process.platform,
				release: release(),
				arch: process.arch,
				node: process.version,
				logicalCpus: cpuList.length,
				cpuModel: cpuList[0]?.model.trim() ?? "unknown",
				hostMemGiB: roundMs(totalmem() / 1024 ** 3),
			},
			environment: {
				inheritedHostEnvironment: true,
				isolatedFromUserTdkConfigAndPath: false,
				childOverrides: ["TMP", "TEMP", "TMPDIR", "NO_COLOR"],
			},
			options: {
				sizes,
				runs,
				warmupCount,
				timeoutMs,
				skipStatus: values["skip-status"],
				commands: commands.map((command) => command.label),
			},
			notes: [
				"Each sample starts a fresh Node process and measures wall time through command exit; fixture generation and cleanup are outside the timed interval.",
				"Service manifests contain only schemaVersion, appName, appType, and stack; this measures count-based discovery, not rich validation or generated runtime files.",
				"Child processes inherit host environment except TMP, TEMP, TMPDIR, and NO_COLOR; user TDK config and PATH are not isolated.",
				"tdk status includes the read-only Tilt probe and is not discovery-only; if Tilt is unavailable it may wait up to the 10-second timeout.",
				"A non-monotonic tdk stacks median may reflect measurement noise; inspect raw samples before drawing scaling conclusions.",
				"No containers or Tilt services are started.",
				"CLI output is captured. Compare results only on like-for-like hardware, operating system, and Node runtime; this is not a CI performance gate.",
			],
			results,
		};

		const outputPath = resolve(
			process.cwd(),
			values.output ??
				join(
					resultsDir,
					`cli-startup-${resultDocument.date.replaceAll(":", "-")}.json`,
				),
		);
		mkdirSync(dirname(outputPath), { recursive: true });
		writeFileSync(outputPath, `${JSON.stringify(resultDocument, null, 2)}\n`);
		console.log(`JSON results: ${outputPath}`);
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
}

try {
	main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
