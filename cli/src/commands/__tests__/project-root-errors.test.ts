// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cleanEnv } from "../../test-support/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const cliBin = path.join(repoRoot, "cli", "bin", "flisk.js");
const commands = ["projects", "resources", "stacks", "networks"] as const;
// Each test starts four Bun processes in a row; under the full suite's parallel load that passes vitest's 5s default.
const CLI_SPAWN_TIMEOUT_MS = 30_000;

function runOutsideProject(args: string[]) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-no-project-"));
  try {
    return spawnSync(process.execPath, [cliBin, ...args], {
      cwd,
      encoding: "utf-8",
      env: cleanEnv({ NO_COLOR: "1" }),
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
            message: "Could not find project root (no .flisk/project.json found)",
          },
        ],
      });
    },
    CLI_SPAWN_TIMEOUT_MS,
  );
});

describe("resource input validation outside a project", () => {
  it(
    "reports an invalid name instead of the missing project root",
    () => {
      const result = runOutsideProject(["resource", "Bad_Name", "--type", "backend"]);

      expect(result.status).toBe(1);
      expect(result.stderr).not.toContain("Could not find project root");
      expect(result.stderr).toContain('Resource name "Bad_Name" is not valid');
    },
    CLI_SPAWN_TIMEOUT_MS,
  );

  it(
    "lists the supported types for an invalid --type",
    () => {
      const result = runOutsideProject(["resource", "api", "--type", "nope"]);

      expect(result.status).toBe(1);
      expect(result.stderr).not.toContain("Could not find project root");
      expect(result.stderr).toContain("backend"); // one valid type is enough to show the list is printed
    },
    CLI_SPAWN_TIMEOUT_MS,
  );

  it(
    "still reports the missing project root for valid input",
    () => {
      const result = runOutsideProject(["resource", "api", "--type", "backend"]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Could not find project root (no .flisk/project.json found)");
    },
    CLI_SPAWN_TIMEOUT_MS,
  );
});
