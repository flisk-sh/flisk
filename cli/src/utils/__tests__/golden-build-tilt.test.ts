// Copyright (c) 2026 TDK Landscape contributors
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
  const project = mkdtempSync(join(tmpdir(), "tdk-golden-tilt-"));
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

/** Runs the generated script in a scratch project with a fake docker and returns what it did. */
function runGolden(
  script: string,
  options: { labelMatches: boolean; buildxVersion?: string; noBuildx?: boolean; rebuild?: boolean },
) {
  const project = mkdtempSync(join(tmpdir(), "tdk-golden-run-"));
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
  buildx) if [ -n "$FAKE_NO_BUILDX" ]; then exit 1; fi; [ "$2" = version ] && echo "github.com/docker/buildx $FAKE_BUILDX_VERSION abc"; exit 0 ;;
  image) echo "$FAKE_LABEL"; exit 0 ;;
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

describe.skipIf(!hasTilt)("golden layer build script", () => {
  const script = generatedGoldenScript();

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

  it("untags the l3-migrator image older engines built, after a build", () => {
    expect(runGolden(script, { labelMatches: false }).calls).toContain(
      "image rm tdk-project-l3-migrator:latest",
    );
    expect(runGolden(script, { labelMatches: true }).calls).not.toContain(
      "image rm tdk-project-l3-migrator:latest",
    );
  });

  it("forces a rebuild with TDK_GOLDEN_REBUILD even when the labels match", () => {
    const run = runGolden(script, { labelMatches: true, rebuild: true });
    expect(run.bake).toHaveLength(1);
  });

  it("passes the filesystem entitlement only on Buildx 0.19 or later", () => {
    expect(runGolden(script, { labelMatches: false, buildxVersion: "v0.37.2" }).bake[0]).toMatch(
      /--allow fs\.read=/,
    );
    expect(
      runGolden(script, { labelMatches: false, buildxVersion: "v0.18.4" }).bake[0],
    ).not.toContain("--allow");
    expect(runGolden(script, { labelMatches: false, buildxVersion: "v0.19.0" }).bake[0]).toMatch(
      /--allow fs\.read=/,
    );
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
