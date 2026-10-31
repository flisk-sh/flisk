// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// openspec make-flisk-unopinionated 4.4: with `orchestration.source: "tiltfile"` in .flisk/project.json, the generated
// .flisk/.flisk-out/Tiltfile only includes the project's own Tiltfile, and nothing Flisk generates writes to that file.
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../types/index.js";
import {
  generateMasterConfigs,
  isWrappedTiltfileStale,
  TemplateEngine,
  verifyMasterConfigs,
  wrappedTiltfilePath,
} from "../template-engine.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const USER_TILTFILE = "# The team's own Tiltfile\nlocal_resource('hello', cmd='pwd > where.txt')\n";

function projectConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    version: "1.0",
    project: { name: "wrap-project", version: "1.0.0" },
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
    ...overrides,
  };
}

const engine = new TemplateEngine(path.join(repoRoot, "cli", "templates"));
const renderTiltfile = (config: ProjectConfig): string =>
  engine.generateTiltfile(engine.buildContext(config));

describe("wrapping an existing Tiltfile", () => {
  describe("generateTiltfile", () => {
    it("generates the full Flisk Tiltfile when project.json names no orchestration source", () => {
      const tiltfile = renderTiltfile(projectConfig());
      expect(tiltfile).toContain("load('ext://flisk-cli'");
      expect(tiltfile).not.toContain("include(");
    });

    it("keeps generating the full Tiltfile for an orchestration source other than tiltfile", () => {
      const tiltfile = renderTiltfile(
        projectConfig({ orchestration: { source: "docker-compose", path: "docker-compose.yml" } }),
      );
      expect(tiltfile).toContain("load('ext://flisk-cli'");
    });

    it("only includes the project's own Tiltfile when orchestration.source is tiltfile", () => {
      const tiltfile = renderTiltfile(
        projectConfig({ orchestration: { source: "tiltfile", path: "Tiltfile" } }),
      );
      expect(tiltfile).toContain('include("../../Tiltfile")');
      expect(tiltfile).not.toContain("ext://flisk-cli");
      expect(tiltfile).not.toContain("load(");
      expect(tiltfile.split("\n")[1]).toBe("# -*- coding: utf-8 -*-");
      const head = tiltfile.split("\n").slice(0, 16).join("\n");
      expect(head).toContain("SYSTEM-GENERATED");
      expect(head).toContain("flisk config regenerate");
    });

    it("includes a Tiltfile in a subfolder by its path from the project root", () => {
      const tiltfile = renderTiltfile(
        projectConfig({ orchestration: { source: "tiltfile", path: "./infra\\Tiltfile" } }),
      );
      expect(tiltfile).toContain('include("../../infra/Tiltfile")');
    });

    it("defaults to the root Tiltfile when orchestration.path is missing", () => {
      const tiltfile = renderTiltfile(projectConfig({ orchestration: { source: "tiltfile" } }));
      expect(tiltfile).toContain('include("../../Tiltfile")');
    });
  });

  describe("wrappedTiltfilePath", () => {
    it("is null unless orchestration.source is tiltfile", () => {
      expect(wrappedTiltfilePath(undefined)).toBeNull();
      expect(wrappedTiltfilePath({ source: "docker-compose" })).toBeNull();
      expect(wrappedTiltfilePath({ source: "tiltfile", path: "infra/Tiltfile" })).toBe(
        "infra/Tiltfile",
      );
    });

    it("uses the stored path as it is, without trimming it", () => {
      expect(wrappedTiltfilePath({ source: "tiltfile", path: "Tiltfile " })).toBe("Tiltfile ");
      expect(wrappedTiltfilePath({ source: "tiltfile", path: " infra\\Tiltfile" })).toBe(
        " infra/Tiltfile",
      );
      expect(wrappedTiltfilePath({ source: "tiltfile", path: "" })).toBe("Tiltfile");
      expect(
        renderTiltfile(projectConfig({ orchestration: { source: "tiltfile", path: "Tiltfile " } })),
      ).toContain('include("../../Tiltfile ")');
    });

    it("refuses a path inside .flisk/, where the wrapper itself is written", () => {
      expect(() =>
        wrappedTiltfilePath({ source: "tiltfile", path: ".flisk/.flisk-out/Tiltfile" }),
      ).toThrow(/points inside \.flisk\//);
    });

    it("refuses a path with a quote or a line break, which would break out of the include string", () => {
      expect(() => wrappedTiltfilePath({ source: "tiltfile", path: 'a"); fail("x' })).toThrow(
        /quote or control character/,
      );
      expect(() => wrappedTiltfilePath({ source: "tiltfile", path: "a\nb" })).toThrow(
        /quote or control character/,
      );
    });
  });

  describe("generateMasterConfigs", () => {
    let projectRoot: string;
    let oldExtensionSource: string | undefined;

    beforeEach(() => {
      projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-wrap-tiltfile-"));
      oldExtensionSource = process.env.FLISK_EXTENSION_SOURCE;
      process.env.FLISK_EXTENSION_SOURCE = repoRoot;
    });

    afterEach(() => {
      if (oldExtensionSource === undefined) delete process.env.FLISK_EXTENSION_SOURCE;
      else process.env.FLISK_EXTENSION_SOURCE = oldExtensionSource;
      fs.rmSync(projectRoot, { recursive: true, force: true });
    });

    const writeProjectJson = (config: ProjectConfig): void => {
      fs.mkdirSync(path.join(projectRoot, ".flisk"), { recursive: true });
      fs.writeFileSync(path.join(projectRoot, ".flisk", "project.json"), JSON.stringify(config));
    };
    const generatedTiltfile = (): string =>
      fs.readFileSync(path.join(projectRoot, ".flisk", ".flisk-out", "Tiltfile"), "utf-8");

    it("writes the wrapper and leaves the user's Tiltfile byte for byte, also on regeneration", async () => {
      const userTiltfile = path.join(projectRoot, "Tiltfile");
      fs.writeFileSync(userTiltfile, USER_TILTFILE);
      const before = fs.statSync(userTiltfile).mtimeMs;
      writeProjectJson(projectConfig({ orchestration: { source: "tiltfile", path: "Tiltfile" } }));

      await generateMasterConfigs(projectRoot, { quiet: true });
      await generateMasterConfigs(projectRoot, { quiet: true, discardHandEdits: true });

      expect(fs.readFileSync(userTiltfile, "utf-8")).toBe(USER_TILTFILE);
      expect(fs.statSync(userTiltfile).mtimeMs).toBe(before);
      expect(generatedTiltfile()).toContain('include("../../Tiltfile")');
      expect(verifyMasterConfigs(projectRoot).errors).toEqual([]);
      expect(isWrappedTiltfileStale(projectRoot)).toBe(false);
    }, 15000);

    it("reports the wrapper as stale when the project switched to its own Tiltfile after generating", async () => {
      fs.writeFileSync(path.join(projectRoot, "Tiltfile"), USER_TILTFILE);
      writeProjectJson(projectConfig());
      await generateMasterConfigs(projectRoot, { quiet: true });
      expect(isWrappedTiltfileStale(projectRoot)).toBe(false);
      expect(generatedTiltfile()).toContain("load('ext://flisk-cli'");

      // What `flisk import tiltfile` (flisk-import) writes to .flisk/project.json.
      writeProjectJson(projectConfig({ orchestration: { source: "tiltfile", path: "Tiltfile" } }));
      expect(isWrappedTiltfileStale(projectRoot)).toBe(true);

      // What `flisk up` does when the check says stale.
      await generateMasterConfigs(projectRoot, { quiet: true });
      expect(isWrappedTiltfileStale(projectRoot)).toBe(false);
      expect(generatedTiltfile()).toContain('include("../../Tiltfile")');
      expect(fs.readFileSync(path.join(projectRoot, "Tiltfile"), "utf-8")).toBe(USER_TILTFILE);
    }, 15000);

    it("reports the wrapper as stale once project.json no longer selects a Tiltfile", async () => {
      fs.writeFileSync(path.join(projectRoot, "Tiltfile"), USER_TILTFILE);
      writeProjectJson(projectConfig({ orchestration: { source: "tiltfile", path: "Tiltfile" } }));
      await generateMasterConfigs(projectRoot, { quiet: true });
      expect(generatedTiltfile()).toContain('include("../../Tiltfile")');

      // orchestration removed: the wrapper must give way to the full generated Tiltfile.
      writeProjectJson(projectConfig());
      expect(isWrappedTiltfileStale(projectRoot)).toBe(true);
      await generateMasterConfigs(projectRoot, { quiet: true });
      expect(generatedTiltfile()).toContain("load('ext://flisk-cli'");
      expect(isWrappedTiltfileStale(projectRoot)).toBe(false);

      // A source other than tiltfile is not a wrapper either.
      writeProjectJson(projectConfig({ orchestration: { source: "tiltfile", path: "Tiltfile" } }));
      await generateMasterConfigs(projectRoot, { quiet: true });
      writeProjectJson(
        projectConfig({ orchestration: { source: "docker-compose", path: "docker-compose.yml" } }),
      );
      expect(isWrappedTiltfileStale(projectRoot)).toBe(true);
      expect(fs.readFileSync(path.join(projectRoot, "Tiltfile"), "utf-8")).toBe(USER_TILTFILE);
    }, 15000);

    describe("a Tiltfile path that is a symlink into .flisk/", () => {
      it("refuses a symlinked Tiltfile that points at the generated wrapper, before it exists", async () => {
        // Dangling until generation writes .flisk/.flisk-out/Tiltfile, which would then include itself.
        fs.symlinkSync(
          path.join(".flisk", ".flisk-out", "Tiltfile"),
          path.join(projectRoot, "Tiltfile"),
        );
        writeProjectJson(
          projectConfig({ orchestration: { source: "tiltfile", path: "Tiltfile" } }),
        );

        expect(() =>
          wrappedTiltfilePath({ source: "tiltfile", path: "Tiltfile" }, projectRoot),
        ).toThrow(/points inside \.flisk\//);
        expect(() => isWrappedTiltfileStale(projectRoot)).toThrow(/points inside \.flisk\//);
        await expect(generateMasterConfigs(projectRoot, { quiet: true })).rejects.toThrow(
          /points inside \.flisk\//,
        );
        expect(fs.existsSync(path.join(projectRoot, ".flisk", ".flisk-out", "Tiltfile"))).toBe(
          false,
        );
      });

      it("refuses a path through a symlinked folder that resolves inside .flisk/", () => {
        fs.mkdirSync(path.join(projectRoot, ".flisk", ".flisk-out"), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, ".flisk", ".flisk-out", "Tiltfile"), USER_TILTFILE);
        fs.symlinkSync(path.join(projectRoot, ".flisk"), path.join(projectRoot, "infra"));

        expect(() =>
          wrappedTiltfilePath(
            { source: "tiltfile", path: "infra/.flisk-out/Tiltfile" },
            projectRoot,
          ),
        ).toThrow(/points inside \.flisk\//);
        // Without a project root the check stays lexical and reads nothing from disk.
        expect(wrappedTiltfilePath({ source: "tiltfile", path: "infra/.flisk-out/Tiltfile" })).toBe(
          "infra/.flisk-out/Tiltfile",
        );
      });

      it("accepts a symlink that points at a Tiltfile outside .flisk/", () => {
        fs.mkdirSync(path.join(projectRoot, "infra"));
        fs.writeFileSync(path.join(projectRoot, "infra", "Tiltfile"), USER_TILTFILE);
        fs.mkdirSync(path.join(projectRoot, ".flisk"), { recursive: true });
        fs.symlinkSync(path.join("infra", "Tiltfile"), path.join(projectRoot, "Tiltfile"));

        expect(wrappedTiltfilePath({ source: "tiltfile", path: "Tiltfile" }, projectRoot)).toBe(
          "Tiltfile",
        );
      });
    });

    const hasTilt = spawnSync("tilt", ["version"], { stdio: "ignore" }).status === 0;
    it.skipIf(!hasTilt)(
      "makes Tilt run the user's Tiltfile from its own folder",
      async () => {
        fs.mkdirSync(path.join(projectRoot, "infra"));
        fs.writeFileSync(path.join(projectRoot, "infra", "Tiltfile"), USER_TILTFILE);
        writeProjectJson(
          projectConfig({ orchestration: { source: "tiltfile", path: "infra/Tiltfile" } }),
        );
        await generateMasterConfigs(projectRoot, { quiet: true });

        const result = spawnSync(
          "tilt",
          ["alpha", "tiltfile-result", "-f", path.join(".flisk", ".flisk-out", "Tiltfile")],
          { cwd: projectRoot, encoding: "utf-8" },
        );
        expect(result.status, result.stderr).toBe(0);
        const parsed = JSON.parse(result.stdout) as {
          Manifests: Array<{ Name: string; DeployTarget: { UpdateCmdSpec: { dir: string } } }>;
        };
        const hello = parsed.Manifests.find((manifest) => manifest.Name === "hello");
        expect(fs.realpathSync(hello?.DeployTarget.UpdateCmdSpec.dir ?? "")).toBe(
          fs.realpathSync(path.join(projectRoot, "infra")),
        );
      },
      30000,
    );
  });
});
