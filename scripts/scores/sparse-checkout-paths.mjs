// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// A job that sparse-checks-out this repository must check out every repository path it runs. MEMORY.md, 2026-10-18
// (#1382/#1383): an E2E job's sparse checkout left out scripts/e2e, which the evidence composite and retry-infra.sh run
// from the workspace, and the missing script only showed up when a job failed. For each job with a sparse checkout of
// this repository (no `repository:`, `${{ github.repository }}`, or flisk-sh/flisk by name), the paths it uses are read from three places:
// `uses: ./<dir>` steps, repository paths in `run:` scripts (relative to the checkout's `path:`, so
// `flisk/scripts/e2e/x.sh` counts for `path: flisk`), and the `run:` scripts of the composite actions those steps call.
// A path is covered when a sparse pattern equals it or is one of its parent directories; root files always are (cone
// mode). Steps whose working-directory is another checkout are not read. A gate at zero.
import YAML from "yaml";
import { read } from "./lib.mjs";
import { workflowFiles } from "./workflow-permissions.mjs";

export const meta = {
	id: "sparse-checkout-paths",
	title: "Repository paths a sparse-checkout job runs but does not check out",
	source: "files",
	mode: "gate",
	target: 0,
	better: "lower",
	unit: "paths",
};

// The top-level directories a run: script can name. Anything else (a URL, $RUNNER_TEMP, a fixture checkout) is not ours.
const REPO_DIRS = new Set([
	".github",
	"scripts",
	"tests",
	"cli",
	"runtime",
	"docs",
	"examples",
	"services",
	"packages",
]);
// A path-like word (one with a "/") after a space, a quote, "=", "(" or ":". The prefix and the top-level directory are
// checked in code, not built into a RegExp from a variable (Semgrep detect-non-literal-regexp).
const PATH_TOKEN = /(?:^|[\s"'=(:])([\w.-]+\/[\w./-]*[\w-])/g;

// Shell comments dropped so prose such as "# see tests/e2e/lib" is not read as a path the job runs.
const code = (script) =>
	String(script)
		.split("\n")
		.map((l) => l.replace(/(^|\s)#.*$/, ""))
		.join("\n");

// Repository paths one run: script names, relative to a checkout at `prefix` ("" for the workspace root).
export function scriptPaths(script, prefix = "") {
	const lead = prefix ? `${prefix.replace(/\/$/, "")}/` : "";
	const out = [];
	for (const m of code(script).matchAll(PATH_TOKEN)) {
		if (!m[1].startsWith(lead)) continue;
		const rel = m[1].slice(lead.length);
		if (REPO_DIRS.has(rel.split("/")[0])) out.push(rel);
	}
	return out;
}

export const covered = (rel, patterns) =>
	!rel.includes("/") || patterns.some((p) => rel === p || rel.startsWith(`${p.replace(/\/$/, "")}/`));

const isSelf = (repository, repo) =>
	repository === undefined ||
	repository === null ||
	/github\.repository\b/.test(String(repository)) ||
	String(repository).toLowerCase() === String(repo).toLowerCase();

// Jobs of one workflow that sparse-check-out this repository: { id, line, checkoutPath, patterns, uses: [{ path, line, via }] }.
export function sparseJobs(text, readAction = () => "", repo = "flisk-sh/flisk") {
	const counter = new YAML.LineCounter();
	const doc = YAML.parseDocument(String(text), { lineCounter: counter });
	if (doc.errors.length) return { error: String(doc.errors[0].message).split("\n")[0], jobs: [] };
	const lineOf = (node) => counter.linePos(node?.range?.[0] ?? 0).line;
	const out = [];
	const jobs = doc.get("jobs", true);
	for (const pair of YAML.isMap(jobs) ? jobs.items : []) {
		const steps = pair.value?.get?.("steps", true);
		if (!YAML.isSeq(steps)) continue;
		const checkout = steps.items.find((s) => {
			const inputs = YAML.isMap(s) ? s.get("with", true) : null;
			return (
				/^actions\/checkout@/.test(String(s?.get?.("uses") ?? "")) &&
				YAML.isMap(inputs) &&
				inputs.get("sparse-checkout") &&
				isSelf(inputs.get("repository"), repo)
			);
		});
		if (!checkout) continue;
		const inputs = checkout.get("with", true);
		const checkoutPath = String(inputs.get("path") ?? "")
			.replace(/^\.\/?/, "")
			.replace(/\/$/, "");
		const patterns = String(inputs.get("sparse-checkout"))
			.split("\n")
			.map((l) => l.trim().replace(/^\//, "").replace(/\/$/, ""))
			.filter((l) => l && !l.startsWith("#"));
		const jobDir = pair.value.getIn?.(["defaults", "run", "working-directory"]);
		const uses = [];
		for (const step of steps.items) {
			if (!YAML.isMap(step) || step === checkout) continue;
			const line = lineOf(step);
			const local = String(step.get("uses") ?? "");
			if (local.startsWith("./")) {
				const dir = local.slice(2).replace(/\/$/, "");
				uses.push({ path: dir, line, via: `uses: ./${dir}` });
				for (const p of compositePaths(readAction(dir))) uses.push({ path: p, line, via: `uses: ./${dir}` });
			}
			const run = step.get("run");
			if (typeof run !== "string") continue;
			const dir = String(step.get("working-directory") ?? jobDir ?? "")
				.replace(/^\.\/?/, "")
				.replace(/\/$/, "");
			if (dir && dir !== checkoutPath) continue;
			// In the checkout's own directory a script names paths without the checkout prefix.
			const prefix = dir === checkoutPath ? "" : checkoutPath;
			for (const p of scriptPaths(run, prefix)) uses.push({ path: p, line, via: "run" });
		}
		out.push({ id: String(pair.key.value), line: lineOf(pair.key), checkoutPath, patterns, uses });
	}
	return { jobs: out };
}

// Repository paths named by the run: steps of a composite action.yml (paths from the workspace root).
export function compositePaths(text) {
	if (!text) return [];
	const doc = YAML.parseDocument(String(text));
	const steps = doc.getIn?.(["runs", "steps"]);
	if (doc.errors.length || !YAML.isSeq(steps)) return [];
	return steps.items.flatMap((s) =>
		YAML.isMap(s) && typeof s.get("run") === "string" ? scriptPaths(s.get("run")) : [],
	);
}

export function measure({ root, repo = "flisk-sh/flisk" }) {
	const readAction = (dir) => read(root, `${dir}/action.yml`) || read(root, `${dir}/action.yaml`);
	const findings = [];
	let jobs = 0;
	for (const file of workflowFiles(root)) {
		const parsed = sparseJobs(read(root, file), readAction, repo);
		if (parsed.error) {
			findings.push(`${file}:1 does not parse as YAML (${parsed.error})`);
			continue;
		}
		for (const job of parsed.jobs) {
			jobs++;
			const seen = new Set();
			for (const use of job.uses) {
				// Composite actions resolve from the workspace root, which is the checkout only when it has no path:.
				const rel = use.via.startsWith("uses:") && job.checkoutPath ? null : use.path;
				if (rel === null || seen.has(rel) || covered(rel, job.patterns)) continue;
				seen.add(rel);
				findings.push(
					`${file}:${use.line} job ${job.id} uses ${rel} (${use.via}) but its sparse-checkout has only ${job.patterns.join(", ")}`,
				);
			}
		}
	}
	return {
		value: findings.length,
		summary: `${jobs} sparse-checkout jobs, ${findings.length} paths they run but do not check out`,
		findings,
	};
}
