// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Whether Flisk still works under WSL2 on Windows. The share of the last 10 completed runs of 🪟 E2E | Platforms WSL2
// (.github/workflows/e2e-platforms-wsl2.yml) that succeeded. The workflow is dispatched by hand only, so a run can be
// weeks old: the summary gives how many runs there were and the date of the newest, so a stale 100% is not read as a
// fresh one. Cancelled and skipped runs are left out.
import { failedRuns, passRate, recentRuns } from "./example-boot-success.mjs";

export const meta = {
	id: "wsl2-smoke",
	title: "WSL2 platform runs that succeeded",
	source: "gh",
	mode: "report",
	better: "higher",
	unit: "%",
};

export const WORKFLOW = "e2e-platforms-wsl2.yml";
export const RUNS = 10;

export function measure(ctx) {
	const runs = recentRuns(ctx.gh, ctx.repo, WORKFLOW, { limit: RUNS });
	if (!runs.length) return { value: null, summary: `no completed run of ${WORKFLOW} (it is dispatched by hand only)` };
	const ok = runs.filter((r) => r.conclusion === "success").length;
	return {
		value: passRate(runs),
		summary: `${ok} of ${runs.length} succeeded (n=${runs.length}), newest run ${runs[0].created_at.slice(0, 10)}; dispatched by hand only`,
		findings: failedRuns(runs),
	};
}
