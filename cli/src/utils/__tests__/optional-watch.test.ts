// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../types/index.js";
import {
  getEnabledCapabilities,
  isWatchEnabled,
  resolveProjectCapabilities,
} from "../capabilities.js";

function makeTempProject(config: Partial<ProjectConfig>): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "flisk-test-opt-watch-"));
  const fliskDir = join(root, ".flisk");
  mkdirSync(fliskDir, { recursive: true });
  writeFileSync(join(fliskDir, "project.json"), JSON.stringify(config, null, 2), "utf-8");
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

describe("optional watch capability", () => {
  it("is on by default", () => {
    expect(isWatchEnabled({})).toBe(true);
    expect(resolveProjectCapabilities({}).watch).toBe(true);
  });

  it("turns off from capabilities.watch in project.json", () => {
    const project = makeTempProject({ capabilities: { watch: false } });
    cleanups.push(project.cleanup);

    expect(isWatchEnabled(project.root)).toBe(false);
    expect(getEnabledCapabilities(project.root)).not.toContain("watch");
    expect(getEnabledCapabilities(project.root)).toEqual(
      expect.arrayContaining(["gateway", "database"]),
    );
  });

  it("stays on when project.json sets it to true", () => {
    const project = makeTempProject({ capabilities: { watch: true } });
    cleanups.push(project.cleanup);

    expect(isWatchEnabled(project.root)).toBe(true);
  });

  it("a flag can only turn watch off, never back on", () => {
    const project = makeTempProject({ capabilities: { watch: false } });
    cleanups.push(project.cleanup);

    expect(isWatchEnabled(project.root, { watch: true })).toBe(false);
    expect(isWatchEnabled({}, { watch: false })).toBe(false);
  });
});
