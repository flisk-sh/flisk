// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The ADE score from scripts/ade-score.mjs, on the scoreboard as a ratchet.
import { runChecks, score } from "../ade-score.mjs";

export const meta = {
	id: "ade",
	title: "Agentic development environment checks",
	source: "files",
	mode: "ratchet",
	better: "higher",
	unit: "points",
};

export function measure({ root }) {
	const results = runChecks(root);
	const s = score(results);
	return {
		value: s.total,
		max: s.max,
		summary: `substrate ${s.halves.substrate.earned}/${s.halves.substrate.max}, workspace ${s.halves.workspace.earned}/${s.halves.workspace.max}`,
		findings: results.filter((r) => !r.pass).map((r) => `${r.id}: ${r.title}${r.detail ? ` (${r.detail})` : ""}`),
	};
}
