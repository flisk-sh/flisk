// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// The golden layer build is the `golden-layers-build` local resource. Tilt generates its shell script; these tests
// run that script against a fake `docker` on PATH and check the skip, bake, version-gate and serial-fallback paths.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const goldenBuild = join(
  repoRoot,
  "engine/topologies/platform/docker/build/golden_image_build.star",
);
const goldenConstants = join(
  repoRoot,
  "engine/topologies/platform/docker/build/golden_image_constants.star",
);
const hasTilt = spawnSync("tilt", ["version"], { encoding: "utf-8" }).status === 0;

if (process.env.TDK_REQUIRE_TILT === "1" && !hasTilt) {
  throw new Error("Tilt is required for the golden build Starlark tests in CI.");
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const GOLDEN_DOCKERFILE = ".tdk/.tdk-out/golden-layers.Dockerfile";
const DOCKERFILE_TEXT = "# golden test Dockerfile\nFROM scratch\n";
const EXPECTED_IMAGES = [
  "tdk-project-l1:latest",
  "tdk-project-l2:latest",
  "tdk-project-l3-backend:latest",
  "tdk-project-l3-frontend:latest",
  "tdk-project-l4-backend:latest",
  "tdk-project-l4-backend-node:latest",
  "tdk-project-l4-frontend:latest",
  "tdk-project-l4-migrator:latest",
];

/** The shell script Tilt would run for the golden build resource. */
function generatedGoldenScript(): string {
  const project = mkdtempSync(join(tmpdir(), "flisk-golden-tilt-"));
  dirs.push(project);
  writeFileSync(
    join(project, "Tiltfile"),
    `load(${JSON.stringify(goldenBuild)}, "build_golden_layers")
build_golden_layers('.')
`,
  );
  const result = spawnSync("tilt", ["alpha", "tiltfile-result", "-f", join(project, "Tiltfile")], {
    cwd: project,
    encoding: "utf-8",
    timeout: 60_000,
  });
  if (result.status !== 0) throw new Error(`tilt failed: ${result.stderr || result.stdout}`);
  const manifest = JSON.parse(result.stdout).Manifests.find(
    (m: { Name: string }) => m.Name === "golden-layers-build",
  );
  return manifest.DeployTarget.UpdateCmdSpec.args[2];
}

interface RunGoldenOptions {
  labelMatches: boolean;
  buildxVersion?: string;
  noBuildx?: boolean;
  rebuild?: boolean;
  missingImages?: string[];
  staleImages?: string[];
  rmSucceeds?: boolean;
}

/** Runs the generated script in a scratch project with a fake docker and returns what it did. */
function runGolden(script: string, options: RunGoldenOptions) {
  const project = mkdtempSync(join(tmpdir(), "flisk-golden-run-"));
  dirs.push(project);
  mkdirSync(join(project, dirname(GOLDEN_DOCKERFILE)), { recursive: true });
  writeFileSync(join(project, GOLDEN_DOCKERFILE), DOCKERFILE_TEXT);
  const hash = createHash("sha256").update(DOCKERFILE_TEXT).digest("hex");

  const bin = join(project, "bin");
  mkdirSync(bin);
  const log = join(project, "docker.log");
  writeFileSync(
    join(bin, "docker"),
    `#!/bin/sh
echo "$*" >> "$FAKE_LOG"
case "$1" in
  buildx)
    if [ -n "$FAKE_NO_BUILDX" ]; then exit 1; fi
    [ "$2" = version ] && echo "github.com/docker/buildx $FAKE_BUILDX_VERSION abc"
    exit 0
    ;;
  image)
    if [ "$2" = inspect ]; then
      img="$5"
      if [ -n "$FAKE_MISSING_IMAGES" ]; then
        for m in $FAKE_MISSING_IMAGES; do
          if [ "$img" = "$m" ]; then exit 1; fi
        done
      fi
      if [ -n "$FAKE_STALE_IMAGES" ]; then
        for s in $FAKE_STALE_IMAGES; do
          if [ "$img" = "$s" ]; then echo "stale-hash"; exit 0; fi
        done
      fi
      echo "$FAKE_LABEL"
      exit 0
    fi
    if [ "$2" = rm ] && [ "$FAKE_RM_SUCCEEDS" = "1" ]; then
      exit 0
    fi
    echo "$FAKE_LABEL"
    exit 0
    ;;
esac
exit 0
`,
  );
  chmodSync(join(bin, "docker"), 0o755);

  const result = spawnSync("sh", ["-c", script], {
    cwd: project,
    encoding: "utf-8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_LOG: log,
      FAKE_LABEL: options.labelMatches ? hash : "stale",
      FAKE_BUILDX_VERSION: options.buildxVersion ?? "v0.37.2",
      FAKE_NO_BUILDX: options.noBuildx ? "1" : "",
      FAKE_MISSING_IMAGES: (options.missingImages ?? []).join(" "),
      FAKE_STALE_IMAGES: (options.staleImages ?? []).join(" "),
      FAKE_RM_SUCCEEDS: options.rmSucceeds ? "1" : "",
      TDK_GOLDEN_REBUILD: options.rebuild ? "1" : "",
    },
  });
  const calls = existsSync(log) ? readFileSync(log, "utf-8").trim().split("\n") : [];
  const hcl = join(project, "golden-layers.bake.hcl");
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    calls,
    bake: calls.filter((c) => c.startsWith("buildx bake")),
    serialBuilds: calls.filter((c) => c.startsWith("build ")),
    hcl: existsSync(hcl) ? readFileSync(hcl, "utf-8") : "",
  };
}

describe("golden image Starlark topology and layer definitions", () => {
  it("defines the expected golden layers and aliases in Starlark constants", () => {
    const constantsSource = readFileSync(goldenConstants, "utf-8");
    for (const key of [
      "'l1'",
      "'l2'",
      "'l3-backend'",
      "'l3-frontend'",
      "'l4-backend'",
      "'l4-backend-node'",
      "'l4-frontend'",
      "'l4-migrator'",
    ]) {
      expect(constantsSource).toContain(key);
    }
    expect(constantsSource).toContain("'l3-migrator': 'l3-backend'");
    expect(constantsSource).toContain("GOLDEN_IMAGE_PREFIX + '-l3-migrator:latest'");
  });

  it("embeds build template enforcing rebuild flag and bake fallback", () => {
    const buildSource = readFileSync(goldenBuild, "utf-8");
    expect(buildSource).toContain('if [ -z "$TDK_GOLDEN_REBUILD" ]; then');
    expect(buildSource).toContain("docker buildx bake");
    expect(buildSource).toContain("docker image rm");
    expect(buildSource).toContain("BUILDX_MAJOR");
    expect(buildSource).toContain("BUILDX_MINOR");
  });
});

describe.skipIf(!hasTilt)("golden layer build script", () => {
  const script = hasTilt ? generatedGoldenScript() : "";

  it("checks every golden tag for the matching hash label and skips the build when they all match", () => {
    const run = runGolden(script, { labelMatches: true });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("up to date");
    expect(run.bake).toEqual([]);
    expect(run.serialBuilds).toEqual([]);
  });

  it("builds every golden target with one bake when a label does not match", () => {
    const run = runGolden(script, { labelMatches: false });
    expect(run.status).toBe(0);
    expect(run.bake).toHaveLength(1);
    expect(run.bake[0]).toContain("--load");
    for (const image of EXPECTED_IMAGES) expect(run.hcl).toContain(`tags = ["${image}"]`);
    expect(run.hcl.match(/^target "/gm)).toHaveLength(EXPECTED_IMAGES.length);
    expect(run.hcl).toContain('"tdk.golden.hash" = HASH');
  });

  it("triggers a full bake when only a single image has a stale label", () => {
    const run = runGolden(script, {
      labelMatches: true,
      staleImages: ["tdk-project-l4-backend-node:latest"],
    });
    expect(run.status).toBe(0);
    expect(run.bake).toHaveLength(1);
  });

  it("triggers a rebuild when an expected image is missing in docker", () => {
    const run = runGolden(script, {
      labelMatches: true,
      missingImages: ["tdk-project-l1:latest"],
    });
    expect(run.status).toBe(0);
    expect(run.bake).toHaveLength(1);
  });

  it("untags the l3-migrator image older engines built, after a build", () => {
    expect(runGolden(script, { labelMatches: false }).calls).toContain(
      "image rm tdk-project-l3-migrator:latest",
    );
    expect(runGolden(script, { labelMatches: true }).calls).not.toContain(
      "image rm tdk-project-l3-migrator:latest",
    );
  });

  it("reports legacy golden image removal when image rm succeeds", () => {
    const run = runGolden(script, { labelMatches: false, rmSucceeds: true });
    expect(run.stdout).toContain("Removed legacy golden image");
  });

  it("forces a rebuild with TDK_GOLDEN_REBUILD even when the labels match", () => {
    const run = runGolden(script, { labelMatches: true, rebuild: true });
    expect(run.bake).toHaveLength(1);
  });

  it("passes the filesystem entitlement on Buildx 0.19 or later and major versions >= 1", () => {
    expect(runGolden(script, { labelMatches: false, buildxVersion: "v0.37.2" }).bake[0]).toMatch(
      /--allow fs\.read=/,
    );
    expect(
      runGolden(script, { labelMatches: false, buildxVersion: "v0.18.4" }).bake[0],
    ).not.toContain("--allow");
    expect(runGolden(script, { labelMatches: false, buildxVersion: "v0.19.0" }).bake[0]).toMatch(
      /--allow fs\.read=/,
    );
    expect(runGolden(script, { labelMatches: false, buildxVersion: "v1.0.0" }).bake[0]).toMatch(
      /--allow fs\.read=/,
    );
    expect(runGolden(script, { labelMatches: false, buildxVersion: "v2.1.0" }).bake[0]).toMatch(
      /--allow fs\.read=/,
    );
  });

  it("omits filesystem entitlement for non-semver development buildx versions", () => {
    const run = runGolden(script, { labelMatches: false, buildxVersion: "dev" });
    expect(run.bake).toHaveLength(1);
    expect(run.bake[0]).not.toContain("--allow");
  });

  it("falls back to one docker build per target, labelled with the hash, when buildx is missing", () => {
    const run = runGolden(script, { labelMatches: false, noBuildx: true });
    expect(run.status).toBe(0);
    expect(run.bake).toEqual([]);
    expect(run.serialBuilds).toHaveLength(EXPECTED_IMAGES.length);
    expect(run.serialBuilds[0]).toContain("--label tdk.golden.hash=");
    expect(run.stdout).toContain("docker buildx is not available");
  });
});
