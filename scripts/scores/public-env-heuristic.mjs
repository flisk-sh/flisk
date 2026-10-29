// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The share of a labelled corpus that `flisk doctor`'s public-env check (#1646) classifies correctly. A heuristic drifts
// two ways: warning on publishable keys, build ids or URLs teaches users to ignore it (false positive), and a loosened
// pattern lets a real key reach the browser (false negative). The corpus (public-env/corpus.mjs) pins both sides; the
// judge is the CLI's own, from cli/dist. Gate at 100: a case that flips is a bug, or a promise changed on purpose in the
// same pull request, here and in docs/troubleshooting.md. See docs/scoreboard/public-env-heuristic.md.
import { CASES } from "./public-env/corpus.mjs";
import { loadJudge } from "./public-env/cli-heuristic.mjs";
import { describeError, evaluate } from "./public-env/evaluate.mjs";

export const meta = {
	id: "public-env-heuristic",
	title: "Public-env secret heuristic agrees with its labelled corpus",
	source: "files",
	mode: "gate",
	target: 100,
	better: "higher",
	unit: "%",
};

export async function measure({ root }, { judge, cases = CASES } = {}) {
	const result = evaluate(judge ?? (await loadJudge(root)), cases);
	const credentials = cases.filter((c) => c.secret).length;
	return {
		value: result.accuracy,
		summary: `${result.right}/${result.total} cases right (${credentials} credentials, ${result.total - credentials} public values)`,
		findings: result.errors.map(describeError),
	};
}
