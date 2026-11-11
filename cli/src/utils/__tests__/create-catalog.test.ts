// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BACKEND_FRAMEWORKS } from "../../backend-frameworks/registry.js";
import { BACKEND_LANGUAGES, DEFAULT_BACKEND_LANGUAGE } from "../../backend-languages/registry.js";
import {
  DEFAULT_FRONTEND_FRAMEWORK,
  FRONTEND_FRAMEWORKS,
} from "../../frontend-frameworks/registry.js";
import { CREATABLE_RESOURCE_TYPES } from "../../types/index.js";
import {
  backendCatalog,
  extraCatalog,
  frontendCatalog,
  localRequirements,
  plainStarterText,
  starterCatalog,
} from "../create-catalog.js";
import { frameworksOfType } from "../infra-presets.js";
import { PROJECT_TEMPLATES } from "../project-templates.js";

const here = dirname(fileURLToPath(import.meta.url));
const source = (relative: string) => readFileSync(join(here, "..", "..", relative), "utf8");

const sorted = (values: string[]) => [...values].sort();

describe("the catalog is read from the registries, not kept here", () => {
  it("offers every frontend framework in the registry, and only those", () => {
    expect(sorted(frontendCatalog().map((o) => o.id))).toEqual(
      sorted(Object.keys(FRONTEND_FRAMEWORKS)),
    );
  });

  it("puts the registry's default frontend first", () => {
    expect(frontendCatalog()[0]?.id).toBe(DEFAULT_FRONTEND_FRAMEWORK);
  });

  it("marks a frontend local when its provider can run on the host", () => {
    for (const option of frontendCatalog()) {
      const provider = FRONTEND_FRAMEWORKS[option.id];
      expect(option.local, option.id).toBe(
        provider?.kind === "server" || provider?.vite !== undefined,
      );
    }
  });

  it("offers every backend language, the registry's default first, with its frameworks", () => {
    const catalog = backendCatalog();
    expect(sorted(catalog.map((o) => o.id))).toEqual(sorted(Object.keys(BACKEND_LANGUAGES)));
    expect(catalog[0]?.id).toBe(DEFAULT_BACKEND_LANGUAGE);
    expect(sorted(catalog[0]?.frameworks.map((f) => f.id) ?? [])).toEqual(
      sorted(Object.keys(BACKEND_FRAMEWORKS)),
    );
  });

  it("a language that owns its runtime offers no framework", () => {
    for (const option of backendCatalog().slice(1)) {
      expect(option.frameworks, option.id).toEqual([]);
    }
  });

  it("offers every project template as a starter, local only when the CLI writes it itself", () => {
    const starters = starterCatalog();
    expect(sorted(starters.map((o) => o.id))).toEqual(sorted(Object.keys(PROJECT_TEMPLATES)));
    for (const starter of starters) {
      expect(starter.local, starter.id).toBe(
        PROJECT_TEMPLATES[starter.id]?.generated !== undefined,
      );
      expect(starter).toMatchObject(
        plainStarterText(starter.id, PROJECT_TEMPLATES[starter.id]?.description ?? ""),
      );
    }
    expect(starters.some((o) => o.local)).toBe(true);
  });

  it("offers every queue and database framework, and the creatable types that are not the app's parts", () => {
    const ids = extraCatalog().map((e) => e.id);
    for (const type of ["queue", "database"]) {
      for (const framework of frameworksOfType(type)) expect(ids).toContain(`${type}:${framework}`);
    }
    const own = CREATABLE_RESOURCE_TYPES.filter(
      (type) => type !== "frontend" && type !== "backend" && type !== "bring-your-own",
    );
    for (const type of own) expect(ids).toContain(type);
    expect(ids).not.toContain("frontend");
    expect(ids).not.toContain("backend");
  });

  it("offers the shared Postgres as database:postgres", () => {
    expect(extraCatalog().find((e) => e.id === "database:postgres")).toMatchObject({
      type: "database",
      framework: "postgres",
    });
  });

  it("reads what a local project needs from the generators", () => {
    expect(localRequirements({ frontend: true })).toEqual(["node", "npm"]);
    expect(localRequirements({ frontend: false, language: DEFAULT_BACKEND_LANGUAGE })).toEqual([
      DEFAULT_BACKEND_LANGUAGE,
    ]);
    // A language that owns its runtime names its program in its dev command.
    for (const [id, provider] of Object.entries(BACKEND_LANGUAGES)) {
      if (!provider.devCommand) continue;
      expect(localRequirements({ frontend: false, language: id })).toEqual([
        provider.devCommand.split(" ")[0],
      ]);
    }
  });
});

describe("create does not keep a catalogue of its own", () => {
  // Every id a registry owns. If create.ts, create-plan.ts or create-catalog.ts spells one as a string, it has grown a
  // second list that someone would have to keep in step with the registry.
  const registryIds = [
    ...Object.keys(FRONTEND_FRAMEWORKS),
    ...Object.keys(BACKEND_FRAMEWORKS),
    ...Object.keys(BACKEND_LANGUAGES),
    ...Object.keys(PROJECT_TEMPLATES),
    ...extraCatalog().map((extra) => extra.id),
  ];
  const files = ["commands/create.ts", "utils/create-plan.ts", "utils/create-catalog.ts"];

  it.each(files)("%s names no framework, language, starter or extra", (file) => {
    const text = source(file);
    const literals = new Set(
      [...text.matchAll(/(["'`])([a-z][a-z0-9:-]*)\1/g)].map((match) => match[2] ?? ""),
    );
    const named = registryIds.filter((id) => literals.has(id));
    expect(named, `${file} spells registry ids as strings`).toEqual([]);
  });

  it("a new provider in a registry shows up with no edit to create", () => {
    // The menus are built by calling the catalog on every call, so a provider added at runtime is offered at once.
    const before = frontendCatalog().length;
    (FRONTEND_FRAMEWORKS as Record<string, unknown>).zzz = {
      id: "zzz",
      label: "Zzz",
      dependencies: {},
      devDependencies: {},
      compilerOptions: {},
      createFiles: () => [],
    };
    try {
      expect(frontendCatalog()).toHaveLength(before + 1);
      expect(frontendCatalog().find((o) => o.id === "zzz")).toMatchObject({
        title: "Zzz",
        local: false,
      });
    } finally {
      delete (FRONTEND_FRAMEWORKS as Record<string, unknown>).zzz;
    }
  });
});

describe("plainStarterText", () => {
  it("turns the description's lead into the title, and keeps the id when there is none", () => {
    expect(plainStarterText("saas", "SaaS starter: account dashboard")).toEqual({
      title: "SaaS starter",
      hint: "account dashboard",
    });
    expect(plainStarterText("demo", "A demo with no lead")).toEqual({
      title: "demo",
      hint: "A demo with no lead",
    });
  });
});
