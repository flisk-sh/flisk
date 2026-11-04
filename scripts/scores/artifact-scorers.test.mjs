// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the scorers that read a CI artifact: install-weight, mutation-score and lighthouse. Run by `make test-shell`.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { measure as installWeight, tarEntries } from "./install-weight.mjs";
import { lighthouseScores, measure as lighthouse } from "./lighthouse.mjs";
import { measure as mutation, mutationScore } from "./mutation-score.mjs";

// A minimal ustar archive: one 512-byte header per file, data padded to 512, two zero blocks at the end.
function tar(files) {
	const blocks = [];
	for (const [fullName, body] of Object.entries(files)) {
		const data = Buffer.from(body);
		const header = Buffer.alloc(512);
		const [prefix, name] = fullName.length > 100 ? [path.dirname(fullName), path.basename(fullName)] : ["", fullName];
		header.write(name, 0);
		header.write(data.length.toString(8).padStart(11, "0"), 124);
		header.write("0", 156);
		header.write("ustar", 257);
		header.write(prefix, 345);
		blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
	}
	return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}

function withTmp(fn) {
	const dir = mkdtempSync(path.join(tmpdir(), "scores-artifact-"));
	try {
		return fn(dir);
	} finally {
		rmSync(dir, { recursive: true });
	}
}

const longName = `package/runtime/${"deep/".repeat(20)}file.star`;
const archive = tar({
	"package/package.json": JSON.stringify({ name: "x", dependencies: { a: "1", b: "2" } }),
	"package/cli/dist/index.js": "x".repeat(3000),
	"package/cli/dist/sub/more.js": "y".repeat(1000),
	[longName]: "z".repeat(600),
});

test("tarEntries reads regular files, sizes and ustar prefixes", () => {
	const entries = tarEntries(archive);
	assert.deepEqual(
		entries.map((e) => [e.name, e.size]),
		[
			["package/package.json", 45],
			["package/cli/dist/index.js", 3000],
			["package/cli/dist/sub/more.js", 1000],
			[longName, 600],
		],
	);
});

test("install-weight reports packed KB, unpacked size, files, dependencies and the heaviest folders", () =>
	withTmp((dir) => {
		const file = path.join(dir, "pkg.tgz");
		writeFileSync(file, gzipSync(archive));
		const r = installWeight({ tarball: file });
		assert.equal(typeof r.value, "number");
		assert.match(r.summary, /^4\.5 KB unpacked, 4 files, 2 runtime dependencies$/);
		assert.equal(r.findings[0], "cli/dist/ 3.9 KB unpacked");
		assert.ok(r.findings.includes("runtime/deep/ 0.6 KB unpacked"));
	}));

test("install-weight has no data without a tarball", () => {
	assert.equal(installWeight({}).value, null);
});

const strykerReport = {
	schemaVersion: "2",
	files: {
		"src/a.ts": {
			mutants: [
				{ mutatorName: "ConditionalExpression", status: "Killed", location: { start: { line: 1 } } },
				{ mutatorName: "StringLiteral", status: "Timeout", location: { start: { line: 2 } } },
				{ mutatorName: "BooleanLiteral", status: "Survived", location: { start: { line: 3 } } },
				{ mutatorName: "ArithmeticOperator", status: "CompileError", location: { start: { line: 4 } } },
			],
		},
		"src/b.ts": {
			mutants: [
				{ mutatorName: "BlockStatement", status: "NoCoverage", location: { start: { line: 9 } } },
				{ mutatorName: "EqualityOperator", status: "Ignored", location: { start: { line: 10 } } },
			],
		},
	},
};

test("mutation score counts killed and timed-out mutants over all that could be detected", () => {
	const s = mutationScore(strykerReport);
	assert.equal(s.score, 50);
	assert.deepEqual([s.detected, s.total], [2, 4]);
});

test("mutation-score lists the weakest file first, then each surviving mutant", () =>
	withTmp((dir) => {
		const file = path.join(dir, "mutation.json");
		writeFileSync(file, JSON.stringify(strykerReport));
		const r = mutation({ mutation: file });
		assert.equal(r.value, 50);
		assert.deepEqual(r.findings, [
			"src/b.ts 0% (0/1)",
			"src/a.ts 66.7% (2/3)",
			"src/a.ts:3 BooleanLiteral Survived",
			"src/b.ts:9 BlockStatement NoCoverage",
		]);
	}));

test("a report with no detectable mutants has no score", () => {
	assert.equal(mutationScore({ files: { "a.ts": { mutants: [{ status: "Ignored" }] } } }).score, null);
});

const lhr = {
	finalDisplayedUrl: "https://flisk.sh/",
	categories: {
		performance: { score: 0.81, auditRefs: [{ id: "lcp", weight: 25 }, { id: "info", weight: 0 }] },
		accessibility: { score: 0.97, auditRefs: [{ id: "contrast", weight: 7 }] },
		"best-practices": { score: 1, auditRefs: [] },
		seo: { score: 0.9, auditRefs: [] },
	},
	audits: {
		lcp: { id: "lcp", title: "Largest Contentful Paint", score: 0.3 },
		info: { id: "info", title: "Diagnostics only", score: 0 },
		contrast: { id: "contrast", title: "Contrast", score: 0 },
	},
};

test("lighthouse averages the four categories and lists failing weighted audits, worst first", () => {
	const s = lighthouseScores(lhr);
	assert.equal(s.mean, 92);
	assert.deepEqual(s.failing.map((a) => a.id), ["contrast", "lcp"]);
});

test("lighthouse reads the report file and names the audited URL", () =>
	withTmp((dir) => {
		const file = path.join(dir, "lhr.json");
		writeFileSync(file, JSON.stringify(lhr));
		const r = lighthouse({ lighthouse: file });
		assert.equal(r.value, 92);
		assert.equal(r.summary, "https://flisk.sh/ performance 81, accessibility 97, best-practices 100, seo 90");
		assert.deepEqual(r.findings, ["contrast: Contrast", "lcp: Largest Contentful Paint"]);
	}));

test("a missing Stryker report is no data with a pointer to the failed step, not an ENOENT", () =>
	withTmp((dir) => {
		const r = mutation({ mutation: path.join(dir, "mutation.json") });
		assert.equal(r.value, null);
		assert.match(r.summary, /the Stryker step failed/);
	}));
