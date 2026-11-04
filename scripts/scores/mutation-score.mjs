// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Mutation score from a Stryker report (`--mutation reports/mutation/mutation.json`, the mutation-testing-elements JSON
// schema): of the mutants the tests could have caught, the share they did catch. Coverage says a line ran; this says a
// test would notice if the line were wrong. Report only: the weekly scoreboard workflow runs Stryker on the generators.
import { existsSync, readFileSync } from "node:fs";
import { round1 } from "./lib.mjs";

export const meta = {
	id: "mutation-score",
	title: "Mutants the CLI tests catch (Stryker)",
	source: "artifact",
	mode: "report",
	better: "higher",
	unit: "%",
};

const DETECTED = new Set(["Killed", "Timeout"]);
const UNDETECTED = new Set(["Survived", "NoCoverage"]);

// Stryker's own formula: detected / (detected + undetected); compile errors, runtime errors and ignored mutants are out.
export function mutationScore(report) {
	const files = Object.entries(report.files ?? {}).map(([file, { mutants = [] }]) => {
		const detected = mutants.filter((m) => DETECTED.has(m.status)).length;
		const undetected = mutants.filter((m) => UNDETECTED.has(m.status));
		const total = detected + undetected.length;
		return { file, detected, total, score: total ? (detected / total) * 100 : null, undetected };
	});
	const detected = files.reduce((n, f) => n + f.detected, 0);
	const total = files.reduce((n, f) => n + f.total, 0);
	return { score: total ? round1((detected / total) * 100) : null, detected, total, files };
}

export function measure({ mutation }) {
	if (!mutation) return { value: null };
	// Stryker writes the report at the end of a run, so a missing file means the run itself failed: say that instead
	// of a bare ENOENT, which reads like a bug in this scorer.
	if (!existsSync(mutation)) {
		return { value: null, summary: `no Stryker report at ${mutation}: the Stryker step failed, see its log` };
	}
	const { score, detected, total, files } = mutationScore(JSON.parse(readFileSync(mutation, "utf8")));
	const survivors = files.flatMap((f) =>
		f.undetected.map((m) => `${f.file}:${m.location?.start?.line ?? "?"} ${m.mutatorName} ${m.status}`),
	);
	const perFile = files
		.filter((f) => f.score !== null)
		.sort((a, b) => a.score - b.score)
		.map((f) => `${f.file} ${round1(f.score)}% (${f.detected}/${f.total})`);
	return {
		value: score,
		summary: `${detected} of ${total} mutants detected`,
		findings: [...perFile, ...survivors],
	};
}
