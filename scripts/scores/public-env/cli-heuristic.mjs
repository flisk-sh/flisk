// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The seam between the scorers and the CLI: the heuristic `flisk doctor` runs, loaded from the built package so the
// scoreboard and the product share one definition. Scorers take the judge as a parameter and default to this loader.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { has } from "../lib.mjs";

export const HEURISTIC_FILE = "cli/dist/utils/public-env-secrets.js";

// The (value, name) -> boolean judge from the built CLI. Throws with the fix when the CLI is not built.
export async function loadJudge(root) {
	if (!has(root, HEURISTIC_FILE)) throw new Error(`${HEURISTIC_FILE} is missing: run \`npm --prefix cli run build\``);
	const mod = await import(pathToFileURL(path.join(root, HEURISTIC_FILE)).href);
	return mod.isSecretLookingValue;
}
