// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tiltAvailable } from "../../cli/src/test-support/index.js";
import {
  cleanEnv,
  danglingLoads,
  EXTENSION_DIRS,
  extensionFingerprint,
  fingerprint,
  flisk,
  KNOWN_DANGLING_LOADS,
  repoRoot,
  run,
  walk,
} from "./helpers.js";

// Review findings 1 and 2: the packaged extension must be flat, complete and usable by a clean project that has
// no source checkout. The staging script is the one `npm publish` uses; release-binaries.sh shares its helpers.

const hasTilt = tiltAvailable();

describe("release bundle staged from the runtime/ source tree", () => {
  let scratch: string;
  let fakeRoot: string;

  beforeAll(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-release-bundle-"));
    // A copy of the repo's staging inputs, so the script stages into scratch and never touches the real cli/.
    fakeRoot = path.join(scratch, "checkout");
    fs.mkdirSync(path.join(fakeRoot, "scripts", "lib"), { recursive: true });
    fs.mkdirSync(path.join(fakeRoot, "cli"), { recursive: true });
    for (const file of ["stage-npm-engine.sh", "lib/runtime-layout.sh"]) {
      fs.copyFileSync(path.join(repoRoot, "scripts", file), path.join(fakeRoot, "scripts", file));
    }
    fs.cpSync(path.join(repoRoot, "runtime"), path.join(fakeRoot, "runtime"), { recursive: true });
  }, 60_000);

  afterAll(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("stages a flat Tiltfile and the four directories into cli/ byte for byte", () => {
    const result = run("bash", ["scripts/stage-npm-engine.sh"], fakeRoot);
    expect(result.status, result.stderr).toBe(0);
    const cli = path.join(fakeRoot, "cli");
    expect(fs.existsSync(path.join(cli, "runtime"))).toBe(false);
    expect(extensionFingerprint(cli, "flat")).toEqual(extensionFingerprint(fakeRoot, "nested"));
    for (const dir of EXTENSION_DIRS) {
      expect(walk(path.join(cli, dir)).length, `${dir} staged`).toBeGreaterThan(0);
    }
  }, 60_000);

  it("adds no relative load() to a missing file in the staged bundle", () => {
    expect(danglingLoads(path.join(fakeRoot, "cli"))).toEqual([...KNOWN_DANGLING_LOADS]);
  });

  it("adds no relative load() to a missing file in the runtime/ source tree", () => {
    expect(danglingLoads(path.join(repoRoot, "runtime"))).toEqual([...KNOWN_DANGLING_LOADS]);
  });

  it("removes every staged file again with --clean", () => {
    const result = run("bash", ["scripts/stage-npm-engine.sh", "--clean"], fakeRoot);
    expect(result.status, result.stderr).toBe(0);
    const cli = path.join(fakeRoot, "cli");
    expect(fs.existsSync(path.join(cli, "Tiltfile"))).toBe(false);
    for (const dir of EXTENSION_DIRS) expect(fs.existsSync(path.join(cli, dir))).toBe(false);
  });

  it("stages the same bundle from a flat (pre-move) checkout", () => {
    const flatRoot = path.join(scratch, "flat-checkout");
    fs.mkdirSync(path.join(flatRoot, "scripts", "lib"), { recursive: true });
    fs.mkdirSync(path.join(flatRoot, "cli"), { recursive: true });
    for (const file of ["stage-npm-engine.sh", "lib/runtime-layout.sh"]) {
      fs.copyFileSync(path.join(repoRoot, "scripts", file), path.join(flatRoot, "scripts", file));
    }
    fs.cpSync(path.join(repoRoot, "runtime"), flatRoot, { recursive: true });
    const result = run("bash", ["scripts/stage-npm-engine.sh"], flatRoot);
    expect(result.status, result.stderr).toBe(0);
    expect(extensionFingerprint(path.join(flatRoot, "cli"), "flat")).toEqual(
      extensionFingerprint(flatRoot, "flat"),
    );
  }, 60_000);

  it("makes release-binaries.sh bundle the Tiltfile and each directory through the layout helpers", () => {
    const script = fs.readFileSync(path.join(repoRoot, "scripts", "release-binaries.sh"), "utf-8");
    expect(script).toContain(`runtime_tiltfile "\${ROOT_DIR}"`);
    for (const dir of EXTENSION_DIRS) {
      expect(script).toContain(`runtime_src_dir "\${ROOT_DIR}" ${dir}`);
      expect(script).toContain(`/flisk-cli/${dir}"`);
    }
    expect(script).toContain("lib/runtime-layout.sh");
  });
});

describe.skipIf(!hasTilt)("clean project installed from the staged bundle only", () => {
  let scratch: string;
  let bundle: string;
  let project: string;

  beforeAll(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-clean-install-"));
    // The bundle is the only extension source: the project never sees repoRoot/runtime.
    bundle = path.join(scratch, "bundle");
    fs.mkdirSync(bundle);
    const nestedBase = path.join(repoRoot, "runtime");
    fs.copyFileSync(path.join(nestedBase, "Tiltfile"), path.join(bundle, "Tiltfile"));
    for (const dir of EXTENSION_DIRS) {
      fs.cpSync(path.join(nestedBase, dir), path.join(bundle, dir), { recursive: true });
    }
    project = path.join(scratch, "fresh-project");
    fs.mkdirSync(project);
    const env = cleanEnv({ FLISK_EXTENSION_SOURCE: bundle });
    expect(run("git", ["init", "-q", "."], project, env).status).toBe(0);
    const created = run("node", [flisk, "project", "--yes"], project, env);
    expect(created.status, created.stderr).toBe(0);
  }, 180_000);

  afterAll(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("vendors every non-test bundle file into .flisk-out/flisk-cli-ext", () => {
    const vendored = path.join(project, ".flisk", ".flisk-out", "flisk-cli-ext");
    const expected = fingerprint(bundle);
    const actual = fingerprint(vendored);
    // The vendor step drops the engine's own test files; everything else must match byte for byte.
    for (const [file, hash] of Object.entries(actual)) expect(expected[file], file).toBe(hash);
    expect(Object.keys(actual).length).toBeGreaterThan(100);
    expect(actual.Tiltfile).toBe(expected.Tiltfile);
    for (const dir of EXTENSION_DIRS) {
      expect(
        Object.keys(actual).some((file) => file.startsWith(`${dir}/`)),
        dir,
      ).toBe(true);
    }
  });

  it("loads in Tilt from the vendored copy: discovery, registry and ext://flisk-cli all resolve", () => {
    const result = run(
      "tilt",
      ["alpha", "tiltfile-result", "-f", ".flisk/.flisk-out/Tiltfile"],
      project,
      cleanEnv({ FLISK_EXTENSION_SOURCE: bundle }),
    );
    expect(result.status, result.stderr).toBe(0);
    const parsed = JSON.parse(result.stdout) as { Error: string | null; Manifests: unknown[] };
    expect(parsed.Error).toBeNull();
    expect(parsed.Manifests.length).toBeGreaterThan(0);
  }, 120_000);

  it("plans a stack start with flisk up --dry-run without a repo checkout", () => {
    const env = cleanEnv({ FLISK_EXTENSION_SOURCE: bundle });
    const added = run(
      "node",
      [flisk, "resource", "web", "--type", "frontend", "--stack", "app", "--yes"],
      project,
      env,
    );
    expect(added.status, added.stderr).toBe(0);
    const dry = run("node", [flisk, "up", "app", "--dry-run"], project, env);
    expect(dry.status, dry.stdout + dry.stderr).toBe(0);
    expect(dry.stdout).toContain("Dry run - not starting services");
    expect(dry.stdout).toContain("web");
  }, 180_000);
});
