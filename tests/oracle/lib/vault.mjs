// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// ORACLE's regression vault: every contradiction ORACLE finds is saved under tests/oracle/regressions/ as a fixture that carries
// its own (minimized) scenario, so it replays without the seed draw and keeps replaying after scenario.mjs changes.
//   status "open":  the contradiction must still be there (the day it is gone, the replay says to flip the fixture to "fixed");
//   status "fixed": the invariant must hold, forever.
// Replays run strict: failures tagged with a knownGap are kept, so an open known gap shows as a failure here.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { checkScenario, INVARIANTS } from "./invariants.mjs";
import { SHAPES } from "./scenario.mjs";
import { collectSurfaces, makeProjectDir, scaffold } from "./surfaces.mjs";

export const SCHEMA_VERSION = 1;
export const KINDS = ["backend", "frontend", "worker", "mcp", "agent", "database", "bring-your-own", "sdk"];

// Only what changes between runs of the same defect is folded: ports on a host, temp paths and ORACLE's generated project names.
// Exit codes, counts and every other number are the symptom and are kept, so "exited 1" and "exited 2" stay different defects.
export function normalizeActual(text) {
	return String(text ?? "")
		.replace(/\b(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+/g, "$1:PORT")
		.replace(/(?:\/private)?\/(?:tmp|var\/folders)\/[^\s"')]+/g, "TMP")
		.replace(/[A-Za-z]:\\[^\s"')]*\\Temp\\[^\s"')]+/gi, "TMP")
		.replace(/\boracle-\d+-[A-Za-z0-9]+/g, "oracle-PROJECT");
}

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
		schema_version: SCHEMA_VERSION,
		engine: "ORACLE",
		invariant: failure.invariant,
		seed: failure.seed ?? scenario.seed,
		shape: scenario.shape,
		commit,
		...(failure.knownGap ? { known_gap: failure.knownGap } : {}),
		...(minimizedFrom ? { minimized_from: `${minimizedFrom} resources` } : {}),
		scenario,
		expected: failure.expected,
		actual: failure.actual,
		reproduction: "node --test tests/oracle/__tests__/regressions.test.mjs",
		status: "open",
	};
}

export const fixtureName = (fx) => `${fx.invariant}-${fx.seed}.json`;

// Every way a fixture can be malformed, as messages (empty when it is valid). The vault refuses to load a malformed fixture.
export function validateFixture(fx) {
	const errors = [];
	const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
	if (fx?.schema_version !== SCHEMA_VERSION) errors.push(`schema_version must be ${SCHEMA_VERSION}`);
	if (fx?.engine !== "ORACLE") errors.push("engine must be ORACLE");
	if (!INVARIANTS.some((i) => i.id === fx?.invariant)) errors.push(`unknown invariant ${fx?.invariant}`);
	if (!["open", "fixed"].includes(fx?.status)) errors.push("status must be open or fixed");
	if (!Number.isInteger(fx?.seed)) errors.push("seed must be an integer");
	if (!(fx?.commit === "unknown" || /^[0-9a-f]{7,40}$/.test(fx?.commit ?? ""))) errors.push("commit must be a short sha or unknown");
	if (!(fx?.shape === "minimized" || SHAPES.includes(fx?.shape))) errors.push(`unknown shape ${fx?.shape}`);
	if (!nonEmpty(fx?.expected) || !nonEmpty(fx?.actual)) errors.push("expected and actual must be non-empty strings");
	if (fx?.known_gap !== undefined && !/^#\d+$/.test(fx.known_gap)) errors.push("known_gap must look like #1234");
	if (fx?.issue !== undefined && !/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/.test(fx.issue)) errors.push("issue must be a GitHub issue URL");
	const sc = fx?.scenario;
	if (!sc || !Array.isArray(sc.resources) || sc.resources.length === 0 || typeof sc.expect !== "object") errors.push("scenario needs resources and expect");
	for (const r of sc?.resources ?? []) {
		if (!/^[a-z][a-z0-9-]{0,62}$/.test(r?.name ?? "")) errors.push(`resource name ${r?.name} is not a valid name`);
		if (!KINDS.includes(r?.kind)) errors.push(`resource ${r?.name}: unknown kind ${r?.kind}`);
		if (!nonEmpty(r?.stack) || !Array.isArray(r?.args)) errors.push(`resource ${r?.name}: needs a stack and args`);
	}
	return errors;
}

export function loadRegressions(dir) {
	return readdirSync(dir)
		.filter((f) => f.endsWith(".json"))
		.sort()
		.map((file) => {
			const fx = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
			const errors = validateFixture(fx);
			if (errors.length) throw new Error(`${file} is not a valid vault fixture: ${errors.join("; ")}`);
			return { file, fx };
		});
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
	const gap = fx.known_gap ? ` and drop the ${fx.known_gap} known-gap tag in invariants.mjs` : "";
	if (!result) return `${file} is marked open but the invariant now holds; set its status to "fixed"${gap}`;
	if (normalizeActual(result.expected) !== normalizeActual(fx.expected)) return `${file} now expects something else: ${result.expected}`;
	return normalizeActual(result.actual) === normalizeActual(fx.actual) ? null : `${file} now fails differently: ${result.actual}`;
}

// Reducer: drop one resource at a time and keep the drop while the same symptom (actual) still reproduces; the expected side is
// not compared here, because it often names the resources and so changes with every drop; repeat whole passes until a
// pass removes nothing (a resource that was needed early can become removable once another is gone). `budget` caps the number
// of replays so a pathological case cannot eat the nightly. Every accepted candidate was itself replayed, so the result always
// reproduces on its own. `replay` is injected so the loop is unit tested without the CLI.
export function minimizeScenario(scenario, failure, replay = (sc) => replayScenario(sc, failure.invariant, { strict: true }), { budget = 40 } = {}) {
	let current = scenario;
	let found = failure; // the failure as the current (smallest) scenario shows it: its expected side names only what is left
	let replays = 0;
	let changed = true;
	while (changed && current.resources.length > 1 && replays < budget) {
		changed = false;
		for (let i = current.resources.length - 1; i >= 0 && current.resources.length > 1 && replays < budget; i--) {
			const dropped = current.resources[i].name;
			const resources = current.resources
				.filter((_, j) => j !== i)
				.map((r) => (r.dependsOn?.includes(dropped) ? { ...r, dependsOn: r.dependsOn.filter((d) => d !== dropped) } : r));
			const candidate = { ...current, resources };
			replays++;
			const result = replay(candidate);
			if (result && normalizeActual(result.actual) === normalizeActual(failure.actual)) {
				current = candidate;
				found = { ...failure, expected: result.expected, actual: result.actual };
				changed = true;
			}
		}
	}
	return { scenario: current, failure: found, replays };
}
