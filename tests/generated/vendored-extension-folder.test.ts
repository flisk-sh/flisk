// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateMasterConfigs } from "../../cli/src/generator/template-engine.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("vendored .flisk/.flisk-out/flisk-cli-ext folder", () => {
  const writeProject = (projectRoot: string) => {
    fs.mkdirSync(path.join(projectRoot, ".flisk"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, ".flisk", "project.json"),
      JSON.stringify({
        version: "1.0",
        project: { name: "vendor-out", version: "1.0.0" },
        phases: {
          pre_alpha: { name: "Pre-Alpha", description: "", enabledStacks: [] },
          alpha: { name: "Alpha", description: "", enabledStacks: [] },
          beta: { name: "Beta", description: "", enabledStacks: [] },
          out_of_scope: { name: "Out of Scope", description: "", enabledStacks: [] },
        },
        optional_infra: {
          monitoring: false,
          elk: false,
          debezium: false,
          golden_image: false,
          verdaccio: false,
        },
        discovery: { paths: ["services/*/*"] },
        overrides: {},
      }),
    );
  };
  const walk = (dir: string): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) =>
        entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
      );
  const withExtensionSource = async (
    source: string,
    run: (projectRoot: string) => Promise<void>,
  ) => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-vendor-out-"));
    const oldExtensionSource = process.env.FLISK_EXTENSION_SOURCE;
    process.env.FLISK_EXTENSION_SOURCE = source;
    try {
      writeProject(projectRoot);
      await generateMasterConfigs(projectRoot);
      await run(projectRoot);
    } finally {
      if (oldExtensionSource === undefined) delete process.env.FLISK_EXTENSION_SOURCE;
      else process.env.FLISK_EXTENSION_SOURCE = oldExtensionSource;
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  };

  it("fills the flat out folder from the nested runtime/ source checkout", async () => {
    await withExtensionSource(repoRoot, async (projectRoot) => {
      const vendored = path.join(projectRoot, ".flisk", ".flisk-out", "flisk-cli-ext");
      expect(fs.statSync(path.join(vendored, "Tiltfile")).isFile()).toBe(true);
      for (const dir of ["engine", "discovery", "specs", "ext"]) {
        expect(walk(path.join(vendored, dir)).length, `${dir} has files`).toBeGreaterThan(0);
      }
      // The vendored layout stays flat: every load() path inside the extension is unchanged.
      expect(fs.existsSync(path.join(vendored, "runtime"))).toBe(false);
      expect(fs.existsSync(path.join(vendored, "engine", "topologies"))).toBe(true);
      expect(fs.existsSync(path.join(vendored, "discovery", "loading.star"))).toBe(true);
    });
  }, 30000);

  it("fills the out folder from a flat packaged bundle", async () => {
    const bundle = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-flat-bundle-"));
    try {
      fs.writeFileSync(path.join(bundle, "Tiltfile"), "# flat bundle\n");
      for (const dir of ["engine", "discovery", "specs", "ext"]) {
        fs.mkdirSync(path.join(bundle, dir), { recursive: true });
        fs.writeFileSync(path.join(bundle, dir, "marker.star"), `# ${dir}\n`);
      }
      await withExtensionSource(bundle, async (projectRoot) => {
        const vendored = path.join(projectRoot, ".flisk", ".flisk-out", "flisk-cli-ext");
        expect(fs.readFileSync(path.join(vendored, "Tiltfile"), "utf-8")).toBe("# flat bundle\n");
        for (const dir of ["engine", "discovery", "specs", "ext"]) {
          expect(fs.readFileSync(path.join(vendored, dir, "marker.star"), "utf-8")).toBe(
            `# ${dir}\n`,
          );
        }
      });
    } finally {
      fs.rmSync(bundle, { recursive: true, force: true });
    }
  }, 30000);

  it("vendors a runtime/ source that carries only the nested Tiltfile", async () => {
    const bundle = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-nested-bundle-"));
    try {
      fs.mkdirSync(path.join(bundle, "runtime"), { recursive: true });
      fs.writeFileSync(path.join(bundle, "runtime", "Tiltfile"), "# nested\n");
      for (const dir of ["engine", "discovery", "specs", "ext"]) {
        fs.mkdirSync(path.join(bundle, "runtime", dir), { recursive: true });
        fs.writeFileSync(path.join(bundle, "runtime", dir, "marker.star"), `# ${dir}\n`);
      }
      await withExtensionSource(bundle, async (projectRoot) => {
        const vendored = path.join(projectRoot, ".flisk", ".flisk-out", "flisk-cli-ext");
        expect(fs.readFileSync(path.join(vendored, "Tiltfile"), "utf-8")).toBe("# nested\n");
        // The Tiltfile, the four markers, and the fingerprint `flisk up` compares with the installed engine (#2899).
        expect(walk(vendored).length).toBe(6);
        expect(fs.existsSync(path.join(vendored, ".source-fingerprint"))).toBe(true);
        expect(fs.existsSync(path.join(vendored, "runtime"))).toBe(false);
      });
    } finally {
      fs.rmSync(bundle, { recursive: true, force: true });
    }
  }, 30000);
});
