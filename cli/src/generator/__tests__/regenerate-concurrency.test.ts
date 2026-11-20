// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { GENERATED_ROOT_BLOCK_START } from "../../utils/gitignore-generated.js";
import {
  ensureProjectRuntimeAssets,
  generateMasterConfigs,
  verifyMasterConfigs,
} from "../template-engine.js";

const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const repoRoot = resolve(cliRoot, "..");
const fliskBin = join(cliRoot, "bin", "flisk.js");

const tempDirs: string[] = [];

function createProject(options: { git?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), "flisk-regen-race-"));
  tempDirs.push(root);
  if (options.git) {
    execFileSync("git", ["init", "-q"], { cwd: root, stdio: "ignore" });
  }
  mkdirSync(join(root, ".flisk"), { recursive: true });
  writeFileSync(
    join(root, ".flisk", "project.json"),
    `${JSON.stringify(
      {
        version: "1.0",
        project: { name: "race-test", version: "1.0.0" },
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
      },
      null,
      2,
    )}\n`,
  );
  return root;
}

function runFlisk(
  cwd: string,
  args: string[],
  envOverrides: Record<string, string>,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [fliskBin, ...args], {
      cwd,
      env: { ...process.env, ...envOverrides },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      resolvePromise({ code, stdout, stderr });
    });
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("concurrent config regeneration (#4021)", () => {
  it("succeeds when generateMasterConfigs runs concurrently in-process and writes .gitignore block once", async () => {
    const root = createProject({ git: true });
    writeFileSync(join(root, ".gitignore"), "my-private-dir/\n");
    const oldSource = process.env.FLISK_EXTENSION_SOURCE;
    process.env.FLISK_EXTENSION_SOURCE = repoRoot;

    try {
      await Promise.all(
        Array.from({ length: 5 }, () => generateMasterConfigs(root, { quiet: true })),
      );

      expect(verifyMasterConfigs(root).valid).toBe(true);
      expect(existsSync(join(root, ".flisk", ".lock"))).toBe(false);
      expect(
        readdirSync(join(root, ".flisk", ".flisk-out")).filter(
          (name) => name.endsWith(".tmp") || name.endsWith(".old"),
        ),
      ).toEqual([]);
      expect(
        readdirSync(join(root, "shared-platform-engineering")).filter(
          (name) => name.endsWith(".tmp") || name.endsWith(".old"),
        ),
      ).toEqual([]);

      const gitignore = readFileSync(join(root, ".gitignore"), "utf-8");
      const blockCount = gitignore.split(GENERATED_ROOT_BLOCK_START).length - 1;
      expect(blockCount).toBe(1);
    } finally {
      if (oldSource === undefined) delete process.env.FLISK_EXTENSION_SOURCE;
      else process.env.FLISK_EXTENSION_SOURCE = oldSource;
    }
  }, 30_000);

  it("succeeds when ensureProjectRuntimeAssets runs concurrently without leaving temp folders", async () => {
    const root = createProject();
    await Promise.all(
      Array.from({ length: 6 }, () =>
        Promise.resolve().then(() => ensureProjectRuntimeAssets(root)),
      ),
    );

    const templatesDir = join(root, "shared-platform-engineering", "docker-templates");
    expect(existsSync(join(templatesDir, "install-deps.sh"))).toBe(true);
    expect(readdirSync(join(root, "shared-platform-engineering"))).toEqual(["docker-templates"]);
  });

  it("succeeds across 5 parallel flisk config regenerate child processes", async () => {
    const root = createProject({ git: true });
    writeFileSync(join(root, ".gitignore"), "my-private-dir/\n");

    // Seed once so the race also exercises replacing existing vendored trees.
    const seed = await runFlisk(root, ["config", "regenerate"], {
      FLISK_EXTENSION_SOURCE: repoRoot,
    });
    expect(seed.code, seed.stderr).toBe(0);

    const runs = await Promise.all(
      Array.from({ length: 5 }, () =>
        runFlisk(root, ["config", "regenerate"], { FLISK_EXTENSION_SOURCE: repoRoot }),
      ),
    );

    for (const run of runs) {
      expect(run.code, `stderr: ${run.stderr}\nstdout: ${run.stdout}`).toBe(0);
    }

    expect(verifyMasterConfigs(root).valid).toBe(true);
    expect(existsSync(join(root, ".flisk", ".lock"))).toBe(false);
    expect(
      readdirSync(join(root, ".flisk", ".flisk-out")).filter(
        (name) => name.endsWith(".tmp") || name.endsWith(".old"),
      ),
    ).toEqual([]);
    expect(readdirSync(join(root, "shared-platform-engineering"))).toEqual(["docker-templates"]);

    const gitignore = readFileSync(join(root, ".gitignore"), "utf-8");
    expect(gitignore.split(GENERATED_ROOT_BLOCK_START).length - 1).toBe(1);
  }, 60_000);
});
