// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// GitHub Actions workflows and composite actions should agree with each other: one pin (SHA and version comment) per
// action, every `uses:` pinned to a 40-hex SHA with a `# vN` comment, one node-version, one runner image per OS, and a
// top-level `permissions:`. A drifting pin means a Dependabot bump missed a file; a stray runner image means a job that
// breaks on its own schedule. One finding per deviation per file. Ratchet on the total.
// Not checked: `timeout-minutes` (scripts/check-ci-inventory.mjs already fails on every job without one, exempt
// entries aside), local `./` actions (resolved from the same commit), expression values (`${{ ... }}`, a matrix or a
// dispatch input chooses them), and `runs-on` lists (self-hosted labels).
import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { walk } from "./lib.mjs";

export const meta = {
	id: "action-consistency",
	title: "Workflow pins, node versions and runners agree",
	source: "files",
	mode: "ratchet",
	better: "lower",
	unit: "anomalies",
};

const USES = /^\s*(?:-\s+)?uses:\s*([^\s#]+)\s*(?:#\s*(.*?))?\s*$/;
const SHA = /^[0-9a-f]{40}$/;

export function workflowFiles(root) {
	return walk(root, ".github", (rel) => /^\.github\/(workflows\/[^/]+|actions\/[^/]+\/action)\.ya?ml$/.test(rel));
}

// uses: lines as { file, line, target, ref, comment }; comment lines are not matched, so a `uses:` quoted in a header
// comment is ignored.
export function usesLines(file, text) {
	const out = [];
	text.split("\n").forEach((l, i) => {
		const m = USES.exec(l);
		if (!m || m[1].startsWith("./")) return;
		const at = m[1].lastIndexOf("@");
		out.push({ file, line: i + 1, target: at < 0 ? m[1] : m[1].slice(0, at), ref: at < 0 ? "" : m[1].slice(at + 1), comment: m[2] ?? "" });
	});
	return out;
}

const repoOf = (target) => target.split("/").slice(0, 2).join("/");
const pinned = (u) => SHA.test(u.ref) || (u.target.startsWith("docker://") && /sha256:/.test(u.target + u.ref));
const mostCommon = (counts) => [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

export function pinProblems(uses) {
	const out = [];
	for (const u of uses) {
		if (!pinned(u)) out.push(`${u.file}:${u.line}: ${u.target}@${u.ref || "(none)"} is not pinned to a 40-hex SHA`);
		else if (!/^v?\d/.test(u.comment)) out.push(`${u.file}:${u.line}: ${u.target}@${u.ref.slice(0, 7)} has no \`# vN\` version comment`);
	}
	const byRepo = new Map();
	for (const u of uses.filter(pinned)) byRepo.set(repoOf(u.target), [...(byRepo.get(repoOf(u.target)) ?? []), u]);
	for (const [repo, list] of byRepo) {
		const variants = new Map();
		for (const u of list) {
			const key = `${u.ref.slice(0, 7)} # ${u.comment || "(no comment)"}`;
			variants.set(key, [...(variants.get(key) ?? []), u.file]);
		}
		if (variants.size < 2) continue;
		const shas = new Set(list.map((u) => u.ref));
		const text = [...variants].map(([k, files]) => `${k} x${files.length}`).join(", ");
		out.push(`${repo}: ${shas.size > 1 ? "different SHAs" : "same SHA, different version comments"}: ${text}`);
	}
	return out;
}

// Deviations from the most common value, one finding per file and value.
function outliers(kind, entries, familyOf = () => "") {
	const out = [];
	const families = new Map();
	for (const e of entries) families.set(familyOf(e.value), [...(families.get(familyOf(e.value)) ?? []), e]);
	for (const [family, list] of families) {
		const counts = new Map();
		for (const e of list) counts.set(e.value, (counts.get(e.value) ?? 0) + 1);
		if (counts.size < 2) continue;
		const [major, n] = mostCommon(counts);
		const dist = [...counts].map(([v, c]) => `${v} x${c}`).join(", ");
		const groups = new Map();
		for (const e of list.filter((x) => x.value !== major)) {
			const k = `${e.file}\0${e.value}`;
			groups.set(k, [...(groups.get(k) ?? []), e.where]);
		}
		for (const [k, where] of groups) {
			const [file, value] = k.split("\0");
			out.push(`${file}: ${kind} ${value} (${where.join(", ")}); most common ${major} x${n} of ${list.length} (${family ? `${family}: ` : ""}${dist})`);
		}
	}
	return out;
}

export function structureProblems(files) {
	const out = [];
	const nodes = [];
	const runners = [];
	for (const { file, text } of files) {
		let doc;
		try {
			doc = YAML.parse(text) ?? {};
		} catch (e) {
			out.push(`${file}: does not parse as YAML (${String(e.message).split("\n")[0]})`);
			continue;
		}
		const isWorkflow = file.includes("/workflows/");
		if (isWorkflow && doc.permissions === undefined) out.push(`${file}: no top-level permissions:`);
		const jobs = isWorkflow ? Object.entries(doc.jobs ?? {}) : [["(action)", { steps: doc.runs?.steps }]];
		for (const [id, job] of jobs) {
			const run = job["runs-on"];
			if (typeof run === "string" && !run.includes("${{")) runners.push({ file, value: run, where: id });
			for (const step of Array.isArray(job.steps) ? job.steps : []) {
				const v = step?.with?.["node-version"];
				if (v !== undefined && !String(v).includes("${{")) nodes.push({ file, value: String(v), where: id });
			}
		}
	}
	const family = (v) => v.replace(/-(latest|\d[\w.]*)$/, "");
	return [...out, ...outliers("node-version", nodes), ...outliers("runs-on", runners, family)];
}

export function analyse(files) {
	const uses = files.flatMap((f) => usesLines(f.file, f.text));
	return [...pinProblems(uses), ...structureProblems(files)];
}

// Deviations from the most common node-version or runner that are on purpose: { file, kind, value, reason }. Each
// covers that value in that file only; an entry that matches no deviation is a finding, so the list cannot go stale.
export const EXPECTED = [
	{
		file: ".github/workflows/ci.yml",
		kind: "node-version",
		value: "22.12",
		reason: "the published-package smoke and audit run on the oldest Node that cli/package.json engines.node allows (>=22.12.0)",
	},
	...["release-binaries.yml", "publish-flisk-import.yml", "publish-existing-npm-to-github-packages.yml"].map((name) => ({
		file: `.github/workflows/${name}`,
		kind: "node-version",
		value: "24.15.0",
		reason: "publish jobs run npm publish with the npm 11 that Node 24 bundles (npm trusted publishing needs npm >= 11.5.1)",
	})),
	{
		file: ".github/workflows/e2e-platforms-wsl2.yml",
		kind: "runs-on",
		value: "windows-2022",
		reason: "the WSL2 suite stays on the Windows image it was validated on (#1876); setup-wsl's wsl --update is flaky (#716)",
	},
];

// Drops the expected deviations from findings and reports EXPECTED entries that match none.
export function withoutExpected(findings, expected = EXPECTED) {
	const used = new Set();
	const kept = findings.filter((f) => {
		const e = expected.find((x) => f.startsWith(`${x.file}: ${x.kind} ${x.value} (`));
		if (e) used.add(e);
		return !e;
	});
	const stale = expected.filter((e) => !used.has(e)).map((e) => `${e.file}: EXPECTED ${e.kind} ${e.value} no longer deviates; remove it`);
	return [...kept, ...stale];
}

export async function measure({ root }, expected = EXPECTED) {
	const files = workflowFiles(root).map((file) => ({ file, text: readFileSync(path.join(root, file), "utf8") }));
	const findings = withoutExpected(analyse(files), expected);
	return { value: findings.length, summary: `${files.length} workflow and action files, ${findings.length} anomalies`, findings };
}
