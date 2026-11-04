// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../types/index.js";
import { findOnPath } from "../../utils/which.js";
import { optionalInfraDefaults, TemplateEngine } from "../template-engine.js";

const infra = (golden_image: boolean): ProjectConfig["optional_infra"] => ({
  monitoring: false,
  elk: false,
  debezium: false,
  golden_image,
  verdaccio: false,
});

describe("optionalInfraDefaults", () => {
  it('passes "golden_image": false to the toggle the Tiltfile reads, so no golden layers are built', () => {
    // The Tiltfile asks should_enable('golden-image'); the underscore key alone was never read, so a project that set
    // golden_image to false still built eight l1-l4 images (about 2.3 GB) on its first run.
    expect(optionalInfraDefaults(infra(false))).toMatchObject({
      golden_image: false,
      "golden-image": false,
    });
  });

  it("keeps the golden layers on when project.json asks for them", () => {
    expect(optionalInfraDefaults(infra(true))).toMatchObject({ "golden-image": true });
  });

  it("adds nothing when project.json does not set golden_image, so the phase default applies", () => {
    const partial = { monitoring: false } as unknown as ProjectConfig["optional_infra"];
    expect(optionalInfraDefaults(partial)).not.toHaveProperty("golden-image");
  });
});

describe("generated spec.master", () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const config = (golden_image: boolean) =>
    ({
      version: "1.0",
      project: { name: "golden-toggle", version: "1.0.0" },
      discovery: { paths: ["services/*/*"] },
      optional_infra: {
        monitoring: false,
        elk: false,
        debezium: false,
        golden_image,
        verdaccio: false,
      },
      phases: {
        // The phase default turns the golden layers on, as for every scaffolded project.
        pre_alpha: { name: "Pre-Alpha", description: "", enabledStacks: ["golden-image"] },
        alpha: { name: "Alpha", description: "", enabledStacks: [] },
        beta: { name: "Beta", description: "", enabledStacks: [] },
        out_of_scope: { name: "Out of Scope", description: "", enabledStacks: [] },
      },
    }) as unknown as ProjectConfig;
  const specMaster = (golden_image: boolean) =>
    new TemplateEngine(join(repoRoot, "cli", "templates")).generateAll(config(golden_image))[
      "spec.master"
    ] as string;

  // Tilt evaluates the generated file the way the Tiltfile does: should_enable('golden-image') reads RESOURCE_DEFAULTS.
  it.skipIf(!findOnPath("tilt")).each([
    [false, false],
    [true, true],
  ])("golden_image %s makes should_enable('golden-image') %s", (golden_image, enabled) => {
    const dir = mkdtempSync(join(tmpdir(), "golden-toggle-"));
    try {
      writeFileSync(join(dir, "spec.master"), specMaster(golden_image));
      writeFileSync(
        join(dir, "Tiltfile"),
        "load('./spec.master', 'RESOURCE_DEFAULTS')\nfail('RESULT' + str(RESOURCE_DEFAULTS.get('golden-image', False)))\n",
      );
      const run = spawnSync("tilt", ["alpha", "tiltfile-result", "-f", join(dir, "Tiltfile")], {
        cwd: dir,
        encoding: "utf-8",
        timeout: 60_000,
      });
      const output = `${run.stdout}${run.stderr}`;
      expect(output).toContain(`RESULT${enabled ? "True" : "False"}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
