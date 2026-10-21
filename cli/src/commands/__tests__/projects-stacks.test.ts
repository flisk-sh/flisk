// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const cliBin = path.join(repoRoot, "cli", "bin", "flisk.js");

describe("tdk projects and stacks", () => {
  let tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    tempDirs = [];
  });

  function createTempDir(): string {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-projects-stacks-"));
    tempDirs.push(tempDir);
    return tempDir;
  }

  function runTdk(cwd: string, args: string[]) {
    return spawnSync(process.execPath, [cliBin, ...args], {
      cwd,
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1" },
    });
  }

  it.each(["projects", "stacks"])(
    "fails with a project-root hint when %s runs outside a project",
    (command) => {
      const result = runTdk(createTempDir(), [command]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Could not find project root");
    },
  );

  it("prints an empty-state message for a project with no stacks", () => {
    const projectRoot = createTempDir();
    fs.mkdirSync(path.join(projectRoot, ".tdk"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, ".tdk", "project.json"), "{}\n");

    const result = runTdk(projectRoot, ["stacks"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No stacks found.");
  });
});
