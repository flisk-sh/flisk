// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// #4178: a recursive chown after install duplicates the whole node_modules tree into a new layer.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));

function exampleDockerfiles(directory) {
	const files = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const full = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...exampleDockerfiles(full));
		} else if (entry.isFile() && entry.name === "Dockerfile") {
			files.push(full);
		}
	}
	return files;
}

test("example Dockerfiles do not chown the installed tree", () => {
	const offenders = exampleDockerfiles(path.join(root, "examples"))
		.filter((file) => /chown\s+-R\s+node:node\s+\./.test(readFileSync(file, "utf8")))
		.map((file) => path.relative(root, file).replaceAll(path.sep, "/"));
	assert.deepEqual(offenders, []);
});
