// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2).map((arg) => arg.replace(/^cli[/\\]/, ""));
const result = spawnSync("vitest", ["run", ...args], {
  stdio: "inherit",
  shell: true,
});
process.exit(result.status ?? 0);
