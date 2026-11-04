// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// How much of what the competitors in docs/competitors/ offer Flisk covers. Per competitor: (covered + 0.5 partial) /
// rows Flisk could reasonably do ("in" scope) x 100; the score is the mean over the competitors. Rows marked
// out-of-scope are a decision (a terminal emulator, a hosted control plane), not a gap, and do not count. The scorer
// also verifies the data: every evidence item of a covered or partial row must pass today (a stale claim is a finding),
// every row needs a source URL, a `checked` date within 90 days, a reason when it is not covered, and a valid ICE
// estimate when it is missing. Findings list the missing rows first, then the data problems. A ratchet: coverage only goes up.
import { dataProblems, counts, coverage, loadAll } from "../competitors/lib.mjs";
import { commandTree, round1 } from "./lib.mjs";

export const meta = {
	id: "competitor-coverage",
	title: "Competitor features Flisk covers",
	source: "files",
	mode: "ratchet",
	better: "higher",
	unit: "%",
};

export async function measure({ root, now = new Date() }) {
	const { index, competitors } = loadAll(root);
	const tree = await commandTree(root);
	const missing = [];
	const problems = [];
	const parts = [];
	const values = [];
	for (const c of competitors) {
		const cov = coverage(c.rows);
		const n = counts(c.rows);
		if (cov) values.push(cov.value);
		parts.push(
			`${c.id} ${cov ? `${cov.value}%` : "n/a"} (${n.covered} covered, ${n.partial} partial, ${n.missing} missing, ${n["out-of-scope"]} out-of-scope)`,
		);
		for (const r of c.rows)
			if (r.flisk?.scope === "in" && r.flisk?.status === "missing") missing.push(`${c.id}/${r.area}/${r.id}: ${c.name} ${r.offer}`);
		problems.push(...(await dataProblems(root, c, index.areas, now, tree)));
	}
	if (!values.length) return { value: null };
	return {
		value: round1(values.reduce((a, b) => a + b, 0) / values.length),
		summary: parts.join("; "),
		findings: [...missing, ...problems],
	};
}
