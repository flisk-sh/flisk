// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../types/index.js";
import { generateDatabaseManagementCompose, TemplateEngine } from "../template-engine.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

const config = {
  version: "1.0",
  project: { name: "header-project", version: "1.0.0" },
  discovery: { paths: ["services/*/*"] },
  optional_infra: {},
  phases: {
    pre_alpha: { name: "Pre-Alpha", description: "", enabledStacks: [] },
    alpha: { name: "Alpha", description: "", enabledStacks: [] },
    beta: { name: "Beta", description: "", enabledStacks: [] },
    out_of_scope: { name: "Out of Scope", description: "", enabledStacks: [] },
  },
} as unknown as ProjectConfig;

const render = () => new TemplateEngine(join(repoRoot, "cli", "templates")).generateAll(config);

describe("generated file headers", () => {
  const files: Record<string, string> = {
    ...render(),
    "database-management/docker-compose.yml": generateDatabaseManagementCompose(config),
  };

  it("renders every generated file", () => {
    expect(Object.keys(files).length).toBeGreaterThanOrEqual(6);
  });

  it.each(Object.keys(files))("%s says it is generated and how to regenerate it", (name) => {
    const head = (files[name] ?? "").split("\n").slice(0, 16).join("\n");
    expect(head).toContain("SYSTEM-GENERATED");
    expect(head).toContain("flisk config regenerate");
  });

  it.each(Object.keys(files))("%s never tells people to run `flisk project`", (name) => {
    expect(files[name]).not.toContain("flisk project");
  });

  it("leaves no empty `Generated:` label in .tiltignore", () => {
    expect(files[".tiltignore"]).not.toMatch(/^# Generated:/m);
  });

  it("keeps a valid coding line in the Tiltfile", () => {
    expect(files.Tiltfile?.split("\n")[1]).toBe("# -*- coding: utf-8 -*-");
  });

  it("renders identically twice", () => {
    expect(render()).toEqual(render());
  });
});
