// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTempDir, createTempProject } from "../../test-support/index.js";
import {
  engineSourceFingerprint,
  generateMasterConfigs,
  isVendoredEngineStale,
} from "../template-engine.js";

/** A flat extension checkout: Tiltfile, engine/, discovery/, specs/, ext/. */
function makeExtensionSource(): string {
  const root = createTempDir("flisk-ext-src-");
  fs.writeFileSync(path.join(root, "Tiltfile"), "# extension Tiltfile\n");
  for (const dir of ["engine", "discovery", "specs", "ext"]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, "main.star"), `# ${dir}\n`);
  }
  return root;
}

function makeTemplates(): string {
  const dir = createTempDir("flisk-templates-");
  fs.writeFileSync(path.join(dir, "Tiltfile.hbs"), "# template\n");
  return dir;
}

function vendoredDir(projectRoot: string): string {
  return path.join(projectRoot, ".flisk", ".flisk-out", "flisk-cli-ext");
}

describe("the vendored engine fingerprint (#2899)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("changes when an engine file or a template changes, and ignores test files", () => {
    const source = makeExtensionSource();
    const templates = makeTemplates();
    const before = engineSourceFingerprint(source, templates);
    expect(engineSourceFingerprint(source, templates)).toBe(before);

    fs.writeFileSync(path.join(source, "engine", "main.star"), "# engine, next release\n");
    const engineChanged = engineSourceFingerprint(source, templates);
    expect(engineChanged).not.toBe(before);

    fs.writeFileSync(path.join(templates, "Tiltfile.hbs"), "# template, next release\n");
    const templateChanged = engineSourceFingerprint(source, templates);
    expect(templateChanged).not.toBe(engineChanged);

    // Vendoring leaves the engine's own tests out, so they do not make a project stale either.
    fs.writeFileSync(path.join(source, "ext", "x.test.ts"), "test\n");
    expect(engineSourceFingerprint(source, templates)).toBe(templateChanged);
  });

  it("calls a project stale when its vendored copy has no fingerprint or another one", () => {
    const source = makeExtensionSource();
    vi.stubEnv("FLISK_EXTENSION_SOURCE", source);
    const project = createTempDir("flisk-stale-");
    // Nothing vendored yet: generation is not this check's job.
    expect(isVendoredEngineStale(project)).toBe(false);

    fs.mkdirSync(vendoredDir(project), { recursive: true });
    // Vendored by a Flisk from before the fingerprint.
    expect(isVendoredEngineStale(project)).toBe(true);

    const stamp = path.join(vendoredDir(project), ".source-fingerprint");
    fs.writeFileSync(stamp, `${engineSourceFingerprint(source)}\n`);
    expect(isVendoredEngineStale(project)).toBe(false);

    // The installed engine changes (an upgrade, or a checkout on another commit).
    fs.writeFileSync(path.join(source, "discovery", "main.star"), "# discovery, next release\n");
    expect(isVendoredEngineStale(project)).toBe(true);
  });

  it("is recorded by generation, so a regenerated project is current until the engine changes again", async () => {
    const source = makeExtensionSource();
    vi.stubEnv("FLISK_EXTENSION_SOURCE", source);
    const project = createTempProject({
      projectJson: {
        version: "1.0",
        project: { name: "stale-engine", version: "1.0.0" },
        phases: Object.fromEntries(
          ["pre_alpha", "alpha", "beta", "out_of_scope"].map((name) => [
            name,
            { name, description: "", enabledStacks: [] },
          ]),
        ),
        optional_infra: {
          monitoring: false,
          elk: false,
          debezium: false,
          golden_image: false,
          verdaccio: false,
        },
        discovery: { paths: ["services/*/*"] },
      },
    });

    await generateMasterConfigs(project, { quiet: true });
    expect(isVendoredEngineStale(project)).toBe(false);

    fs.writeFileSync(path.join(source, "engine", "main.star"), "# engine, next release\n");
    expect(isVendoredEngineStale(project)).toBe(true);

    await generateMasterConfigs(project, { quiet: true });
    expect(isVendoredEngineStale(project)).toBe(false);
    expect(fs.readFileSync(path.join(vendoredDir(project), "engine", "main.star"), "utf-8")).toBe(
      "# engine, next release\n",
    );
  });
});
