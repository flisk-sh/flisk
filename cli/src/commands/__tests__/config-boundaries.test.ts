// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importInvocation } from "../import.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const tdk = path.join(repoRoot, "cli", "bin", "flisk.js");

function projectJson(): string {
  return JSON.stringify({
    version: "1.0",
    project: { name: "boundaries", version: "1.0.0" },
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
  });
}

function writeProject(root: string, service: Record<string, unknown>): string {
  fs.mkdirSync(path.join(root, ".tdk"), { recursive: true });
  fs.mkdirSync(path.join(root, "services", "api"), { recursive: true });
  fs.writeFileSync(path.join(root, ".tdk", "project.json"), projectJson());
  const servicePath = path.join(root, "services", "api", "service.json");
  fs.writeFileSync(servicePath, `${JSON.stringify(service, null, 2)}\n`);
  return servicePath;
}

function run(root: string, args: string[]) {
  return spawnSync(process.execPath, [tdk, ...args], { cwd: root, encoding: "utf-8" });
}

// Each case spawns the built CLI. Under the parallel suite and a loaded machine that exceeds 20-30s, so the budget is 120s.
describe("config command boundaries", () => {
  // One generated project for the tests that only read regenerated output. Each copies it, so the regenerate
  // run happens once per file instead of once per test.
  const baseService = { appName: "api", appType: "api", stack: "core", extra: true };
  let baseRoot = "";

  beforeAll(() => {
    baseRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-boundaries-base-"));
    writeProject(baseRoot, baseService);
    expect(run(baseRoot, ["config", "regenerate"]).status).toBe(0);
  }, 120_000);

  afterAll(() => {
    fs.rmSync(baseRoot, { recursive: true, force: true });
  });

  /** A fresh copy of the generated base project. The caller removes it. */
  function copyBase(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    fs.cpSync(baseRoot, root, { recursive: true });
    return root;
  }

  it("regenerate rewrites generated files and leaves service.json byte-identical", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-regen-"));
    const service = { appName: "api", appType: "api", stack: "core", extra: true };
    const servicePath = writeProject(root, service);
    const before = fs.readFileSync(servicePath);
    try {
      const result = run(root, ["config", "regenerate"]);
      expect(result.status, result.stderr).toBe(0);
      expect(fs.readFileSync(servicePath)).toEqual(before);
      expect(fs.existsSync(path.join(root, ".tdk", ".tdk-out", "Tiltfile"))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);

  it("regenerate --dry-run writes nothing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-regen-dry-"));
    writeProject(root, { appName: "api", appType: "api", stack: "core" });
    try {
      const result = run(root, ["config", "regenerate", "--dry-run"]);
      expect(result.status, result.stderr).toBe(0);
      expect(fs.existsSync(path.join(root, ".tdk", ".tdk-out", "Tiltfile"))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);

  it("a second regenerate is byte-identical and verify exits 0", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-regen-stable-"));
    writeProject(root, { appName: "api", appType: "api", stack: "core", schemaVersion: 1 });
    try {
      expect(run(root, ["config", "regenerate"]).status).toBe(0);
      const first = fs.readFileSync(path.join(root, ".tdk", ".tdk-out", "Tiltfile"));
      expect(run(root, ["config", "regenerate"]).status).toBe(0);
      expect(fs.readFileSync(path.join(root, ".tdk", ".tdk-out", "Tiltfile"))).toEqual(first);
      const verify = run(root, ["config", "verify"]);
      expect(verify.status, verify.stdout + verify.stderr).toBe(0);
      expect(verify.stdout).toContain("in sync");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);

  it("verify points a missing schemaVersion at migrate, not regenerate", () => {
    const root = copyBase("tdk-verify-schema-");
    try {
      const verify = run(root, ["config", "verify"]);
      expect(verify.status).toBe(1);
      expect(verify.stdout).toContain("tdk config migrate");
      expect(verify.stdout).not.toContain("tdk config regenerate");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);

  it("migrate writes schemaVersion and does not rewrite generated files", () => {
    const root = copyBase("tdk-migrate-");
    const servicePath = path.join(root, "services", "api", "service.json");
    try {
      const generated = fs.readFileSync(path.join(root, ".tdk", ".tdk-out", "Tiltfile"));
      const result = run(root, ["config", "migrate"]);
      expect(result.status, result.stderr).toBe(0);
      const migrated = JSON.parse(fs.readFileSync(servicePath, "utf-8")) as {
        schemaVersion: number;
        extra: boolean;
      };
      expect(migrated.schemaVersion).toBe(1);
      expect(migrated.extra).toBe(true);
      expect(fs.readFileSync(path.join(root, ".tdk", ".tdk-out", "Tiltfile"))).toEqual(generated);
      const again = fs.readFileSync(servicePath);
      expect(run(root, ["config", "migrate"]).status).toBe(0);
      expect(fs.readFileSync(servicePath)).toEqual(again);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);

  it("migrate refuses an unsupported schemaVersion without writing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-migrate-bad-"));
    const servicePath = writeProject(root, {
      appName: "api",
      appType: "api",
      stack: "core",
      schemaVersion: 99,
    });
    const before = fs.readFileSync(servicePath);
    try {
      const result = run(root, ["config", "migrate"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("unsupported version 99");
      expect(fs.readFileSync(servicePath)).toEqual(before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);

  it("import does not invoke regenerate or migrate", () => {
    const inv = importInvocation([".", "--dry-run"], {}, "linux");
    expect(inv.args.join(" ")).not.toContain("regenerate");
    expect(inv.args.join(" ")).not.toContain("migrate");
    expect(inv.command).toBe("npx");
  });
});
