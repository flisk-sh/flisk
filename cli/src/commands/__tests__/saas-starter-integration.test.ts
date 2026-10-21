// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// These spawn `flisk project` per test; the 5s default times out when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 60_000 });

// Get the CLI bin path dynamically
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_BIN_PATH = join(__dirname, "..", "..", "..", "bin", "flisk.js");

// `flisk doctor` requires these (see REQUIRED_ENV_VARS in ../../utils/env-validator.ts);
// an empty .env satisfies `flisk project`'s docker-compose validation but leaves doctor
// reporting "Environment not ready". Use the same defaults env-validator would generate.
function writeTestEnvFile(starterRoot: string) {
  writeFileSync(
    join(starterRoot, ".env"),
    "VERDACCIO_URL_DOCKER=http://verdaccio:4873\nTILT_ENV=dev\nDB_PASSWORD=test-password\n",
  );
}

// Runs the CLI with an argument array and the working directory set, so paths are never
// spliced into a shell command string. Throws on a non-zero exit, like execSync did.
function runCli(cwd: string, args: string[], env: Record<string, string> = {}): string {
  const result = spawnSync("bun", [CLI_BIN_PATH, ...args], {
    cwd,
    encoding: "utf-8",
    stdio: "pipe",
    env: { ...process.env, ...env },
    timeout: 120_000,
  });
  if (result.status !== 0) {
    throw new Error(
      `flisk ${args.join(" ")} failed in ${cwd} (exit ${result.status}):\n${result.stderr}`,
    );
  }
  return result.stdout;
}

// tdk-cli-extensions is a sibling checkout, not a dependency of this repo, so its
// location varies per machine. Respect an explicit override, then fall back to the
// conventional sibling-directory layout (both repos checked out next to each other),
// instead of hardcoding one contributor's absolute path.
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const EXTENSION_SOURCE =
  process.env.TDK_EXTENSION_SOURCE ?? join(REPO_ROOT, "..", "tdk-cli-extensions");
const EXTENSION_SOURCE_AVAILABLE = existsSync(EXTENSION_SOURCE);

describe.skipIf(!EXTENSION_SOURCE_AVAILABLE)("saas-starter cloning and discovery", () => {
  if (!EXTENSION_SOURCE_AVAILABLE) {
    console.warn(
      `Skipping saas-starter integration tests: tdk-cli-extensions not found at ${EXTENSION_SOURCE}. ` +
        "Set TDK_EXTENSION_SOURCE to its checkout path to run these.",
    );
  }

  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `tdk-saas-test-${Date.now()}`);
  });

  afterEach(() => {
    try {
      // Safety: only delete if path is under tmpdir and contains our test marker
      if (
        testDir?.startsWith(tmpdir()) &&
        testDir.includes("tdk-saas-test-") &&
        testDir.length > 20
      ) {
        rmSync(testDir, { recursive: true, force: true });
      }
    } catch {
      // cleanup best-effort
    }
  });

  /**
   * Verifies that `flisk project saas` clones the repo correctly with required
   * structure (services/stack/service/service.json files).
   */
  it("should clone saas-starter with valid file structure", () => {
    const cwd = testDir;
    mkdirSync(cwd, { recursive: true });

    const result = runCli(cwd, ["project", "saas", "--yes"]);

    expect(result).toContain("Cloned");
    expect(existsSync(join(cwd, "tdk-saas-starter", "services"))).toBe(true);

    // Verify all 4 saas services exist with valid service.json
    const services = [
      "services/app/dashboard-api/service.json",
      "services/app/dashboard-app/service.json",
      "services/billing/billing-api/service.json",
      "services/billing/checkout-app/service.json",
    ];

    for (const svc of services) {
      const path = join(cwd, "tdk-saas-starter", svc);
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, "utf-8");
      const manifest = JSON.parse(content);
      expect(manifest).toHaveProperty("appName");
      expect(manifest).toHaveProperty("stack");
      expect(manifest.healthCheck).toBeDefined();
    }
  }, 30000); // 30s: clones the real saas-starter repo over the network

  /**
   * Verifies that `flisk project --yes` (after cloning) correctly discovers
   * the existing service stacks (app, billing) from service.json files and
   * auto-populates them in project.json's pre_alpha services, so that
   * `flisk up` will enable them (before fix: they were silently filtered out
   * in Tilt discovery).
   */
  it("should auto-populate discovered services in project.json", () => {
    const cwd = testDir;
    mkdirSync(cwd, { recursive: true });

    // Clone
    runCli(cwd, ["project", "saas", "--yes"]);

    const starterRoot = join(cwd, "tdk-saas-starter");
    writeTestEnvFile(starterRoot);

    // Generate project config
    runCli(starterRoot, ["project", "--yes"], { TDK_EXTENSION_SOURCE: EXTENSION_SOURCE });

    // Verify project.json has services populated
    const projectJsonPath = join(starterRoot, ".tdk", "project.json");
    expect(existsSync(projectJsonPath)).toBe(true);

    const projectJson = JSON.parse(readFileSync(projectJsonPath, "utf-8"));
    expect(projectJson.phases.pre_alpha.enabledStacks).toContain("app");
    expect(projectJson.phases.pre_alpha.enabledStacks).toContain("billing");
  }, 30000); // 30s: clones the real saas-starter repo over the network

  /**
   * Verifies that spec.master is generated with PRE_ALPHA_RESOURCES dict
   * containing the discovered stacks, so that Tilt's should_enable() check
   * will allow them to pass through (before fix: PRE_ALPHA_RESOURCES was empty,
   * and only infra resources appeared in `tilt get uiresources`).
   */
  it("should generate spec.master with discovered services in PRE_ALPHA_RESOURCES", () => {
    const cwd = testDir;
    mkdirSync(cwd, { recursive: true });

    runCli(cwd, ["project", "saas", "--yes"]);

    const starterRoot = join(cwd, "tdk-saas-starter");
    writeTestEnvFile(starterRoot);

    runCli(starterRoot, ["project", "--yes"], { TDK_EXTENSION_SOURCE: EXTENSION_SOURCE });

    const specPath = join(starterRoot, ".tdk", ".tdk-out", "spec.master");
    expect(existsSync(specPath)).toBe(true);

    const specContent = readFileSync(specPath, "utf-8");

    // Before fix: PRE_ALPHA_RESOURCES = { }
    // After fix: PRE_ALPHA_RESOURCES = { "app": True, "billing": True, }
    expect(specContent).toContain("PRE_ALPHA_RESOURCES = {");
    expect(specContent).toMatch(/"app":\s*True/);
    expect(specContent).toMatch(/"billing":\s*True/);
    expect(specContent).toContain("FOCUS_PRE_ALPHA = list(PRE_ALPHA_RESOURCES.keys())");
  });

  /**
   * Verifies that `flisk doctor` correctly reports master configs as present
   * (they are in .tdk/.tdk-out/, not the project root).
   */
  it("should pass doctor check after project init", () => {
    const cwd = testDir;
    mkdirSync(cwd, { recursive: true });

    runCli(cwd, ["project", "saas", "--yes"]);

    const starterRoot = join(cwd, "tdk-saas-starter");
    writeTestEnvFile(starterRoot);

    runCli(starterRoot, ["project", "--yes"], { TDK_EXTENSION_SOURCE: EXTENSION_SOURCE });

    // Check the master-config result even if another local project occupies ingress ports.
    const doctorResult = spawnSync("bun", [CLI_BIN_PATH, "doctor"], {
      cwd: starterRoot,
      encoding: "utf-8",
      timeout: 60_000,
    });

    expect(doctorResult.error).toBeUndefined();
    expect(doctorResult.stdout).toContain(
      "TILT_TECH_STACK.star, TILT_RESOURCE_DEFAULTS.star, spec.master found",
    );
  }, 60000); // matches the 60s spawnSync limit on the doctor run above
});
