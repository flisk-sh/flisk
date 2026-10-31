// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const vitestPath = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
const args = process.argv.slice(2).map((arg) => arg.replace(/^cli[/\\]/, ""));
const result = spawnSync(process.execPath, [vitestPath, "run", ...args], {
  stdio: "inherit",
});
process.exit(result.status ?? 0);
