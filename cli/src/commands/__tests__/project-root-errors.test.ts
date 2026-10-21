// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const cliBin = path.join(repoRoot, "cli", "bin", "tdk.js");
const commands = ["projects", "resources", "stacks", "networks"] as const;
// Each test starts four Bun processes in a row; under the full suite's parallel load that passes vitest's 5s default.
const CLI_SPAWN_TIMEOUT_MS = 30_000;

function runOutsideProject(args: string[]) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-no-project-"));
  try {
    return spawnSync(process.execPath, [cliBin, ...args], {
      cwd,
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1" },
    });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

describe("missing project root errors", () => {
  it(
    "uses identical human-readable errors across project commands",
    () => {
      const results = commands.map((command) => runOutsideProject([command]));

      expect(results.map((result) => result.status)).toEqual([1, 1, 1, 1]);
      expect(new Set(results.map((result) => result.stderr)).size).toBe(1);
      expect(results[0].stderr).toContain("initialize a new project");
    },
    CLI_SPAWN_TIMEOUT_MS,
  );

  it(
    "returns the same machine-readable error across JSON commands",
    () => {
      const results = commands.map((command) => runOutsideProject([command, "--json"]));

      expect(results.map((result) => result.status)).toEqual([1, 1, 1, 1]);
      const reports = results.map((result) => JSON.parse(result.stdout));
      expect(new Set(reports.map((report) => JSON.stringify(report))).size).toBe(1);
      expect(reports[0]).toMatchObject({
        schemaVersion: 1,
        data: null,
        errors: [
          {
            code: "COMMAND_FAILED",
            message: "Could not find project root (no .tdk/project.json found)",
          },
        ],
      });
    },
    CLI_SPAWN_TIMEOUT_MS,
  );
});
