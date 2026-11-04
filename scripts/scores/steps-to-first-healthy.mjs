// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// How many commands a newcomer types before `flisk up` starts a healthy stack, counted in README.md's terminal
// quickstart (the block translation-drift compares) from its first line to the `flisk up` line. `a && b` is two
// commands; blank and comment lines are none. Each command is one more place to give up, so the ratchet only lets the
// number go down.
import { read } from "./lib.mjs";
import { FLISK_UP, quickstart, shellCommands } from "./translation-drift.mjs";

export const meta = {
	id: "steps-to-first-healthy",
	title: "Commands from install to flisk up in the README quickstart",
	source: "files",
	mode: "ratchet",
	better: "lower",
	unit: "commands",
};

// The commands of a quickstart up to and including the first `flisk up`.
export function stepsToUp(body) {
	const commands = shellCommands(body);
	const up = commands.findIndex((c) => FLISK_UP.test(c));
	return up < 0 ? commands : commands.slice(0, up + 1);
}

export function measure({ root }) {
	const block = quickstart(read(root, "README.md"));
	if (!block) throw new Error("README.md has no shell block that runs flisk up");
	const steps = stepsToUp(block.body);
	return { value: steps.length, summary: `README.md:${block.line}: ${steps.join(" → ")}` };
}
