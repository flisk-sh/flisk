// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createTempDir } from "../../test-support/temp-project.js";
import type { VolumeRunner } from "../demo-reset.js";
import type { ProjectRecord } from "../project-registry.js";
import { cleanStaleVolumesForScaffold } from "../scaffold-volume-cleanup.js";

const NAME = "repeat-app";

function projectFolder(prefix: string, name = NAME): string {
  const dir = createTempDir(prefix);
  mkdirSync(join(dir, ".flisk"));
  writeFileSync(join(dir, ".flisk", "project.json"), JSON.stringify({ project: { name } }));
  return dir;
}

function record(roots: string[]): ProjectRecord {
  return { name: NAME, roots, stacks: ["app"], updatedAt: "" };
}

describe("cleanStaleVolumesForScaffold (#3983)", () => {
  it("clears the old project's volume on a second scaffold", () => {
    const old = projectFolder("old-scaffold-");
    const fresh = projectFolder("new-scaffold-");
    rmSync(old, { recursive: true, force: true }); // the repro deletes the first folder
    const own = `${NAME}-database-management_repeat_app_postgres_data`;
    const unrelated = "other-database-management_other_postgres_data";
    const remove = vi.fn();
    const docker: VolumeRunner = {
      list: () => [
        { name: own, composeProject: `${NAME}-database-management` },
        { name: unrelated, composeProject: "other-database-management" },
      ],
      remove,
    };

    const result = cleanStaleVolumesForScaffold(fresh, {
      docker,
      stacks: ["app"],
      readRecords: () => [record([old, fresh])],
      foreignOwners: () => [],
    });

    expect(result.projectName).toBe(NAME);
    expect(result.removed).toEqual([own]);
    expect(remove).toHaveBeenCalledExactlyOnceWith(own);
  });

  it("leaves unrelated volumes, including a name-prefix neighbour, untouched", () => {
    const fresh = projectFolder("fresh-scaffold-");
    const remove = vi.fn();
    const docker: VolumeRunner = {
      list: () => [
        { name: "unrelated", composeProject: "other-database-management" },
        { name: "neighbour", composeProject: `${NAME}-2-database-management` },
      ],
      remove,
    };

    const result = cleanStaleVolumesForScaffold(fresh, {
      docker,
      stacks: ["app"],
      readRecords: () => [],
      foreignOwners: () => [],
    });

    expect(result.candidates).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
  });

  it("preserves the volume when another folder still holds the project", () => {
    const original = projectFolder("original-scaffold-");
    const fresh = projectFolder("again-scaffold-");
    const remove = vi.fn();
    const docker: VolumeRunner = {
      list: () => [
        {
          name: "original-postgres",
          composeProject: `${NAME}-database-management`,
        },
      ],
      remove,
    };

    const result = cleanStaleVolumesForScaffold(fresh, {
      docker,
      stacks: ["app"],
      readRecords: () => [record([original, fresh])],
      foreignOwners: () => [],
    });

    expect(result.skippedReason).toBe("shared-folder");
    expect(result.removed).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
  });

  it("preserves the volume when a running stack from another folder uses the name", () => {
    const fresh = projectFolder("running-scaffold-");
    const remove = vi.fn();
    const docker: VolumeRunner = {
      list: () => [
        {
          name: "running-postgres",
          composeProject: `${NAME}-database-management`,
        },
      ],
      remove,
    };

    const result = cleanStaleVolumesForScaffold(fresh, {
      docker,
      stacks: ["app"],
      readRecords: () => [],
      foreignOwners: () => ["/some/other/checkout"],
    });

    expect(result.skippedReason).toBe("running-stack");
    expect(result.removed).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
  });
});
