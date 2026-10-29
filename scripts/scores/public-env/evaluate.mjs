// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Scores a judge against a labelled corpus. Pure: judge and cases in, a verdict out, so it is tested with stub judges.

// "false negative" when a credential is missed, "false positive" when a public value is flagged, null when right.
export function errorKind(judge, testCase) {
	const flagged = Boolean(judge(testCase.value, testCase.name));
	if (flagged === testCase.secret) return null;
	return testCase.secret ? "false negative" : "false positive";
}

// { right, total, accuracy (percent, 1 decimal), errors: [{ kind, case }] }.
export function evaluate(judge, cases) {
	const errors = cases.flatMap((c) => {
		const kind = errorKind(judge, c);
		return kind ? [{ kind, case: c }] : [];
	});
	const total = cases.length;
	return { right: total - errors.length, total, accuracy: Math.round(((total - errors.length) / total) * 1000) / 10, errors };
}

// One line per error: the promise and the variable, never the value.
export const describeError = ({ kind, case: c }) => `${c.why} (${c.name}): ${kind}`;
