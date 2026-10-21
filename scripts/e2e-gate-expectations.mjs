// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The e2e group gates the CI summary job aggregates, and the CI event each one reports for (#1816).
//
// The e2e gates live in their own workflows, so the summary job cannot wait for them with `needs:`: it reads their check runs
// on the head commit instead, and a gate that never reported is a missing gate that fails the summary.
//
// A gate reports only when its workflow is triggered. The examples and platforms gates run on a pull request, on a merge
// queue entry and when they are dispatched by hand; they do not run on a push to main. The journeys gate also runs on a push
// to main. Waiting for a gate that cannot report burns the whole deadline and then fails the run, so the list of gates
// depends on the event the CI workflow ran for. A manual dispatch of ci.yml starts no sibling workflow, so it waits for
// nothing.
//
//   node scripts/e2e-gate-expectations.mjs --event push
// prints the gate names the summary job waits for, space separated, and nothing when there is nothing to wait for.
import path from "node:path";
import { fileURLToPath } from "node:url";

// The gate check names and the workflow file that reports them.
export const GATES = {
	"e2e-journeys": { workflow: "e2e-journeys.yml", job: "e2e-journeys" },
	"e2e-examples": { workflow: "e2e-examples.yml", job: "e2e-examples" },
	"e2e-platforms": { workflow: "e2e-platforms.yml", job: "e2e-platforms" },
};

// The gates each CI event waits for. A pull request and a merge queue entry run every gate. A push to main runs the
// journeys gate only. A manual dispatch of ci.yml starts no gate workflow, so it waits for nothing.
export const GATES_BY_EVENT = {
	pull_request: ["e2e-journeys", "e2e-examples", "e2e-platforms"],
	merge_group: ["e2e-journeys", "e2e-examples", "e2e-platforms"],
	push: ["e2e-journeys"],
	workflow_dispatch: [],
};

// The gates for a CI event; an event the CI workflow does not have waits for nothing.
export function gatesForEvent(event) {
	return GATES_BY_EVENT[event] ?? [];
}

// The workflow file that reports a gate, or null for a gate nobody reports.
export function workflowForGate(gate) {
	return GATES[gate]?.workflow ?? null;
}

function main(argv) {
	let event = process.env.GITHUB_EVENT_NAME ?? "";
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === "--event") event = argv[++i] ?? "";
		else throw new Error(`unknown argument: ${argv[i]}`);
	}
	console.log(gatesForEvent(event).join(" "));
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	try {
		main(process.argv.slice(2));
	} catch (error) {
		console.error(`e2e-gate-expectations: ${error.message}`);
		process.exit(1);
	}
}
