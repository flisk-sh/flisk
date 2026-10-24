// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../types/index.js";
import { generateDatabaseManagementCompose, TemplateEngine } from "../template-engine.js";
import { compareWithGolden, UPDATE_COMMAND } from "./golden-helpers.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const goldenRoot = join(here, "golden");
const update = process.env.UPDATE_GOLDEN === "1";

function project(name: string, enabledStacks: string[]): ProjectConfig {
  return {
    version: "1.0",
    project: { name, version: "1.0.0" },
    discovery: { paths: ["services/*/*"] },
    optional_infra: {},
    phases: {
      pre_alpha: { name: "Pre-Alpha", description: "", enabledStacks },
      alpha: { name: "Alpha", description: "", enabledStacks: [] },
      beta: { name: "Beta", description: "", enabledStacks: [] },
      out_of_scope: { name: "Out of Scope", description: "", enabledStacks: [] },
    },
  } as unknown as ProjectConfig;
}

// Representative projects: one stack, a stack plus the shared database feature, and several stacks.
const FIXTURES: Record<string, ProjectConfig> = {
  "basic-stack": project("basic-stack", ["app"]),
  "database-management": project("database-management", ["app", "database-management"]),
  "multi-stack": project("multi-stack", ["app", "billing", "shop"]),
};

function generate(config: ProjectConfig): Record<string, string> {
  const engine = new TemplateEngine(join(repoRoot, "cli", "templates"));
  return {
    ...engine.generateAll(config),
    "database-management.docker-compose.yml": generateDatabaseManagementCompose(config),
  };
}

describe("golden generated output", () => {
  it.each(Object.keys(FIXTURES))("%s matches its golden files", (name) => {
    const problems = compareWithGolden(
      generate(FIXTURES[name] as ProjectConfig),
      join(goldenRoot, name),
      update,
    );
    expect(
      problems,
      `Generated output changed. If that is intended, accept it with:\n  ${UPDATE_COMMAND}\nand commit the golden files.`,
    ).toEqual([]);
  });

  it("generates the same bytes every time for the same project", () => {
    for (const config of Object.values(FIXTURES)) {
      expect(generate(config)).toEqual(generate(config));
    }
  });
});

describe("the golden comparison itself", () => {
  let dir: string;
  const files = { Tiltfile: "line one\nline two\n", ".tiltignore": "node_modules/\n" };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "flisk-golden-"));
    compareWithGolden(files, dir, true);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("passes when nothing changed", () => {
    expect(compareWithGolden(files, dir)).toEqual([]);
  });

  it("names a file whose output changed by one character", () => {
    const problems = compareWithGolden({ ...files, Tiltfile: "line one\nline twO\n" }, dir);
    expect(problems).toEqual(["Tiltfile: generated output differs from its golden file"]);
  });

  it("names a generated file that has no golden yet", () => {
    const problems = compareWithGolden({ ...files, "spec.master": "new\n" }, dir);
    expect(problems).toEqual(["spec.master: no golden file yet"]);
  });

  it("names a golden file that nothing generates any more", () => {
    writeFileSync(join(dir, "old.star"), "gone\n");
    const problems = compareWithGolden(files, dir);
    expect(problems).toEqual(["old.star: golden file that nothing generates any more"]);
  });

  it("ignores line-ending differences, so a Windows checkout does not fail", () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "Tiltfile"), "line one\r\nline two\r\n");
    expect(compareWithGolden(files, dir)).toEqual([]);
  });

  it("accepts an intentional change in update mode and removes stale goldens", () => {
    writeFileSync(join(dir, "old.star"), "gone\n");
    const changed = { ...files, Tiltfile: "different\n" };
    expect(compareWithGolden(changed, dir, true)).toEqual([]);
    expect(compareWithGolden(changed, dir)).toEqual([]);
  });
});
