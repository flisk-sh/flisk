// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Finds the names of `flisk doctor` checks in the CLI sources. A check is a CheckResult literal, so its name is a
// `name: "Title Case"` property alone on a line (or after `return {`). The contract is the convention, not the compiler:
// a check built any other way is invisible here, which keeps the count conservative.
import { read, walk } from "../lib.mjs";

// The files that build doctor CheckResults; tests are excluded.
export const DOCTOR_SOURCE =
	/^cli\/src\/(commands\/doctor[\w-]*|utils\/(doctor[\w-]*|windows-doctor|service-config-checks|public-env-secrets))\.ts$/;

const NAME_LINE = /^\s*(?:return \{ )?name: "([A-Z][^"]{2,60})",?\s*$/gm;

// The distinct check names in one file's text, in order of first appearance.
export function checkNames(text) {
	return [...new Set([...text.matchAll(NAME_LINE)].map((m) => m[1]))];
}

// Every distinct check name across the doctor sources under root, sorted.
export function collectCheckNames(root) {
	const files = walk(root, "cli/src", (rel) => DOCTOR_SOURCE.test(rel));
	return [...new Set(files.flatMap((rel) => checkNames(read(root, rel))))].sort();
}
