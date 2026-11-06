// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// ORACLE's regression vault: every contradiction ORACLE finds is saved under tests/oracle/regressions/ as a fixture that carries
// its own (minimized) scenario, so it replays without the seed draw and keeps replaying after scenario.mjs changes.
//   status "open":  the contradiction must still be there (the day it is gone, the replay says to flip the fixture to "fixed");
//   status "fixed": the invariant must hold, forever.
// Replays run strict: the known-gap exemptions in invariants.mjs are off, so an open gap shows as a failure here.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { checkScenario } from "./invariants.mjs";
import { collectSurfaces, makeProjectDir, scaffold } from "./surfaces.mjs";

// Digits differ between runs (ports, counts, temp names); the symptom does not.
export const normalizeActual = (text) => String(text ?? "").replace(/\d+/g, "N");

const headCommit = () => {
	try {
		return execFileSync("git", ["rev-parse", "--short=8", "HEAD"], { encoding: "utf8" }).trim();
	} catch {
		return "unknown";
	}
};

// A failure (bug-memory shape) plus the scenario that produced it becomes a fixture ready to commit.
export function toRegression(failure, scenario, { commit = headCommit(), minimizedFrom } = {}) {
	return {
		engine: "ORACLE",
		invariant: failure.invariant,
		seed: failure.seed ?? scenario.seed,
		shape: scenario.shape,
		commit,
		...(minimizedFrom ? { minimized_from: `${minimizedFrom} resources` } : {}),
		scenario,
		expected: failure.expected,
		actual: failure.actual,
		reproduction: "node --test tests/oracle/__tests__/regressions.test.mjs",
		status: "open",
	};
}

export const fixtureName = (fx) => `${fx.invariant}-${fx.seed}.json`;

export function loadRegressions(dir) {
	return readdirSync(dir)
		.filter((f) => f.endsWith(".json"))
		.sort()
		.map((file) => ({ file, fx: JSON.parse(readFileSync(path.join(dir, file), "utf8")) }));
}

// Scaffold the fixture's scenario with the real CLI and return the failure of the fixture's invariant, or null when it holds.
export function replayScenario(scenario, invariant, { strict = true } = {}) {
	const dir = makeProjectDir(scenario.seed ?? 0);
	try {
		const extra = scaffold(scenario, dir);
		return checkScenario(collectSurfaces(dir, extra), scenario, { strict }).find((f) => f.invariant === invariant) ?? null;
	} finally {
		rmSync(path.dirname(dir), { recursive: true, force: true });
	}
}

// The vault's rule, kept pure so it is unit tested: null when the replay matches the fixture's status, else what to do.
export function verdict(file, fx, result) {
	if (fx.status === "fixed") return result ? `${file} regressed: ${result.actual}` : null;
	if (!result) return `${file} is marked open but the invariant now holds; set its status to "fixed" (and drop any known-gap exemption it names)`;
	return normalizeActual(result.actual) === normalizeActual(fx.actual) ? null : `${file} now fails differently: ${result.actual}`;
}

// Greedy reducer: drop one resource at a time and keep the drop while the same invariant still fails with the same symptom.
// `replay` is injected so the loop is unit tested without the CLI.
export function minimizeScenario(scenario, failure, replay = (sc) => replayScenario(sc, failure.invariant, { strict: false })) {
	let current = scenario;
	for (let i = current.resources.length - 1; i >= 0 && current.resources.length > 1; i--) {
		const dropped = current.resources[i].name;
		const resources = current.resources
			.filter((_, j) => j !== i)
			.map((r) => (r.dependsOn?.includes(dropped) ? { ...r, dependsOn: r.dependsOn.filter((d) => d !== dropped) } : r));
		const candidate = { ...current, resources };
		const result = replay(candidate);
		if (result && normalizeActual(result.actual) === normalizeActual(failure.actual)) current = candidate;
	}
	return current;
}
