// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Every third-party image Flisk generates or ships stays audited. This gate reads the engine (runtime/), the CLI
// generators and templates, the release image and the examples for image references (`FROM x`, `image: x`, and quoted
// `image`/`*_BASE` literals) and fails on:
//   - an image with no tag, or with `:latest` and no digest (a digest makes the tag cosmetic, so `:latest@sha256:...` passes);
//   - a release line on EOL below that is past its end-of-life date, or one the table does not know yet;
//   - an image the engine or the CLI generates that docs/security.md does not list in its Images inventory.
// The EOL dates come from https://endoflife.date; the table was last checked on 2026-11-14. To add a line, put it in
// EOL in the same change that uses it. Policy for the references (tags plus digests, who refreshes them) is in
// docs/security.md#images.
import { isTestFile, read, walk } from "./lib.mjs";

export const meta = {
	id: "base-images",
	title: "Generated and shipped images are supported, tagged and listed",
	source: "files",
	mode: "gate",
	target: 0,
	better: "lower",
	unit: "violations",
};

// Release line -> end-of-life date (YYYY-MM-DD), or null for a supported line with no announced end. A line missing here fails.
export const EOL = {
	node: { 18: "2025-04-30", 20: "2026-04-30", 22: "2027-04-30", 24: "2028-04-30", 25: "2026-06-01", 26: "2029-04-30" },
	python: { "3.10": "2026-10-01", 3.11: "2027-10-31", 3.12: "2028-10-31", 3.13: "2029-10-31", 3.14: "2030-10-31", 3.15: "2031-10-31" },
	golang: { 1.23: "2025-08-12", 1.24: "2026-02-10", 1.25: "2026-08-19", 1.26: null, 1.27: null },
	alpine: { 3.19: "2025-11-01", "3.20": "2026-04-01", 3.21: "2026-11-01", 3.22: "2027-05-01", 3.23: "2027-11-01", 3.24: "2028-06-01" },
	debian: { bullseye: "2026-08-31", bookworm: "2028-06-30", trixie: "2030-06-30" },
	nginx: { 1.27: "2025-06-24", 1.28: "2026-04-14", 1.29: "2026-05-13", "1.30": null, 1.31: null },
	redis: { 7.2: "2029-12-01", 7.4: "2029-12-01", "8.0": "2026-12-01", 8.2: "2030-09-01" },
	postgres: { 14: "2026-11-12", 15: "2027-11-11", 16: "2028-11-09", 17: "2029-11-08", 18: "2030-11-14" },
	mysql: { 8.4: "2032-04-30", 9.7: "2034-04-30" },
	mongo: { "7.0": "2027-08-31", "8.0": "2029-10-31", 8.2: "2026-07-31", 8.3: "2029-10-31" },
	rabbitmq: { 4.1: "2026-01-30", 4.2: "2026-07-31", 4.3: "2027-01-31", 4.4: "2027-07-31" },
	traefik: { 3.6: "2026-08-16", 3.7: null },
	dotnet: { "8.0": "2026-11-10", "9.0": "2026-11-10", "10.0": "2028-11-14" },
	php: { 8.3: "2027-12-31", 8.4: "2028-12-31", 8.5: "2029-12-31" },
	ruby: { 3.3: "2027-03-31", 3.4: "2028-03-31", "4.0": "2029-03-31" },
	"eclipse-temurin": { 21: "2029-12-31", 25: "2031-09-30" },
};

// Image name -> the key in EOL and how a tag names its release line.
const LINE = {
	node: /^(\d+)/,
	python: /^(\d+\.\d+)/,
	golang: /^(\d+\.\d+)/,
	alpine: /^(\d+\.\d+)/,
	debian: /^(bullseye|bookworm|trixie)/,
	nginx: /^(\d+\.\d+)/,
	redis: /^(\d+\.\d+)/,
	postgres: /^(\d+)/,
	mysql: /^(\d+\.\d+)/,
	mongo: /^(\d+\.\d+)/,
	rabbitmq: /^(\d+\.\d+)/,
	traefik: /^v?(\d+\.\d+)/,
	dotnet: /^(\d+\.\d+)/,
	php: /^(\d+\.\d+)/,
	ruby: /^(\d+\.\d+)/,
	"eclipse-temurin": /^(\d+)/,
};

// Agreed exceptions: { ref, reason }. A ref is `name:tag` without the digest. None today.
export const ALLOWED = [];

const EXAMPLES_FILE = /(^|\/)(Dockerfile[\w.-]*|[\w.-]*\.ya?ml)$/;
// Prose that mentions images for an agent to write into a project; it is not an image Flisk builds on.
const NOT_INVENTORY = ["cli/src/utils/tool-catalog.ts"];

const isSource = (rel) =>
	!isTestFile(rel) &&
	!/(^|\/)(__tests__|tests|test-support|node_modules)\//.test(rel) &&
	/\.(star|ts|mjs|json|ya?ml|hbs|sh)$|(^|\/)Dockerfile[\w.-]*$|\.Dockerfile$/.test(rel);

// `docker.io/library/node` -> `node`; `mcr.microsoft.com/dotnet/sdk` -> `dotnet`.
export function imageName(repo) {
	const r = repo.replace(/^docker\.io\//, "").replace(/^library\//, "");
	return /^mcr\.microsoft\.com\/dotnet\/(sdk|aspnet|runtime)$/.test(r) ? "dotnet" : r;
}

const REPO = "((?:[a-z0-9][a-z0-9.-]*(?::\\d+)?\\/)?(?:[a-z0-9][a-z0-9._-]*\\/)*[a-z0-9][a-z0-9._-]*)";
const REF = `${REPO}(?::([A-Za-z0-9._-]+))?(@sha256:[0-9a-f]{64})?`;
const FROM = new RegExp(`(?:^\\s*|["'\`+])FROM\\s+(?:--platform=\\S+\\s+)?${REF}(?:\\s+AS\\s+([\\w.-]+))?`);
// A quoted literal counts only as the value of an image-like name: `image: "x:1"`, `"image_base": "x:1"`, `BUN_BASE = "x:1"`,
// `base_image = a if b else "x:1"`. That leaves out `node:fs` imports and `prune:images` style keys.
const QUOTED = new RegExp(
	`(?:\\bimage\\w*|\\w*_image|[A-Z_]*(?:BASE|IMAGE))["']?\\s*[:=]\\s*(?:[^"'\`]*\\belse\\s+)?["'\`]${REF}["'\`]`,
);
const YAML_IMAGE = new RegExp(`\\bimage:\\s*["']?${REF}["']?\\s*(?:#.*)?$`);

// The references on one line: { name, tag, digest, kind }. `aliases` collects stage names so `FROM base` is not an image.
export function scanLine(line, aliases = new Set()) {
	const refs = [];
	if (/^\s*(#|\/\/)/.test(line)) return refs;
	const from = FROM.exec(line);
	if (from) {
		const [, repo, tag, digest, alias] = from;
		if (alias) aliases.add(alias);
		if (!/[${}]/.test(line.slice(from.index, from.index + from[0].length))) {
			refs.push({ repo, tag, digest, from: true });
		}
	}
	const yaml = YAML_IMAGE.exec(line);
	if (yaml?.[2]) refs.push({ repo: yaml[1], tag: yaml[2], digest: yaml[3], from: false });
	const q = from ? null : QUOTED.exec(line);
	if (q?.[2]) refs.push({ repo: q[1], tag: q[2], digest: q[3], from: false });
	return refs;
}

// The release line of a reference in EOL, or null when the image is not tracked.
export function lineOf(name, tag) {
	const rule = LINE[name];
	if (!rule || !tag) return null;
	return rule.exec(tag)?.[1] ?? null;
}

export function today(now) {
	return (now instanceof Date ? now : new Date(now ?? Date.now())).toISOString().slice(0, 10);
}

// Findings for one reference: [] when it passes.
export function check(ref, where, now, allowed = ALLOWED) {
	const name = imageName(ref.repo);
	const shown = `${name}${ref.tag ? `:${ref.tag}` : ""}`;
	if (allowed.some((a) => a.ref === shown)) return [];
	const out = [];
	if (!ref.tag && !ref.digest) out.push(`${where} ${shown}: no tag, so it is :latest; pin a version`);
	else if (ref.tag === "latest" && !ref.digest) out.push(`${where} ${shown} has no digest; pin a version or a digest`);
	const line = lineOf(name, ref.tag);
	if (line !== null) {
		const eol = EOL[name]?.[line];
		if (eol === undefined) out.push(`${where} ${shown}: release line ${line} is not in EOL in scripts/scores/base-images.mjs; add its end-of-life date`);
		else if (eol !== null && eol < today(now)) out.push(`${where} ${shown}: ${name} ${line} reached end of life on ${eol}; move to a supported line`);
	}
	return out;
}

// A bare `FROM l4_backend_runtime` or `FROM base` names an earlier stage of the same Dockerfile, not an image.
export const isStage = (ref, aliases) =>
	!ref.tag && !ref.digest && (aliases.has(ref.repo) || /^[a-z0-9]+(_[a-z0-9]+)+$/.test(ref.repo) || /^(base|build|builder|deps|test|production|development|runtime|final|app)$/.test(ref.repo));

export function engineFiles(root) {
	const keep = (rel) => isSource(rel);
	return [
		...walk(root, "runtime", keep),
		...walk(root, "cli/src", keep),
		...walk(root, "cli/templates", keep),
		...walk(root, "scripts/release", keep),
	];
}

export function exampleFiles(root) {
	return walk(root, "examples", (rel) => EXAMPLES_FILE.test(rel) && !isTestFile(rel));
}

// Distinct `name:tag` pairs of the engine and CLI, with every file that uses them.
export function engineInventory(root, files = engineFiles(root)) {
	const aliases = new Set();
	const texts = files.map((rel) => [rel, read(root, rel)]);
	for (const [, text] of texts) for (const line of text.split("\n")) scanLine(line, aliases);
	const seen = new Map();
	for (const [rel, text] of texts) {
		text.split("\n").forEach((line) => {
			for (const ref of scanLine(line, new Set())) {
				if (isStage(ref, aliases)) continue;
				const name = imageName(ref.repo);
				const key = ref.tag ? `${name}:${ref.tag}` : name;
				seen.set(key, [...(seen.get(key) ?? []), rel]);
			}
		});
	}
	return seen;
}

export function measure({ root, now }, allowed = ALLOWED) {
	const files = [...engineFiles(root), ...exampleFiles(root)];
	const texts = files.map((rel) => [rel, read(root, rel)]);
	const aliases = new Set();
	for (const [, text] of texts) for (const line of text.split("\n")) scanLine(line, aliases);
	const findings = [];
	const used = new Set();
	let refs = 0;
	for (const [rel, text] of texts) {
		text.split("\n").forEach((line, i) => {
			for (const ref of scanLine(line, new Set())) {
				if (isStage(ref, aliases)) continue;
				refs++;
				const name = imageName(ref.repo);
				const key = `${name}${ref.tag ? `:${ref.tag}` : ""}`;
				const hit = allowed.find((a) => a.ref === key);
				if (hit) used.add(hit);
				findings.push(...check(ref, `${rel}:${i + 1}`, now, allowed));
			}
		});
	}
	const doc = read(root, "docs/security.md");
	for (const [key, rels] of engineInventory(root)) {
		const rel = rels.find((r) => !NOT_INVENTORY.includes(r));
		if (!rel) continue;
		const [name, tag] = key.split(/:(.*)/s);
		const listed = tag ? doc.includes(`\`${name}\``) && doc.includes(`\`${tag}\``) : doc.includes(`\`${name}\``);
		if (!listed) findings.push(`${rel}: ${key} is not in the image inventory of docs/security.md#images`);
	}
	for (const a of allowed) if (!used.has(a)) findings.push(`${a.ref}: ALLOWED entry no longer matches anything; remove it`);
	return {
		value: findings.length,
		summary: `${refs} image references in ${files.length} files, ${findings.length} violations`,
		findings,
	};
}
