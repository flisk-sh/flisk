// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("tdk config verify --json", () => {
  const runVerify = (projectRoot: string) =>
    spawnSync(
      process.execPath,
      [path.join(repoRoot, "cli", "bin", "tdk.js"), "config", "verify", "--json"],
      { cwd: projectRoot, encoding: "utf-8" },
    );

  it("prints one JSON report and exits 1 for drift without Commander diagnostics", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-config-verify-json-"));
    try {
      fs.mkdirSync(path.join(projectRoot, ".tdk"), { recursive: true });
      fs.writeFileSync(
        path.join(projectRoot, ".tdk", "project.json"),
        JSON.stringify({
          version: "1.0",
          project: { name: "verify-json", version: "1.0.0" },
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
        }),
      );

      const result = runVerify(projectRoot);

      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      const lines = result.stdout.trim().split(/\r?\n/);
      expect(lines).toHaveLength(1);
      const report = JSON.parse(lines[0]);
      expect(report).toMatchObject({
        schemaVersion: 1,
        data: { valid: false },
        errors: [],
      });
      expect(report.data.errors).toContain(
        "Missing file: .tdk/.tdk-out/Tiltfile (run 'tdk config regenerate')",
      );
      expect(
        report.data.diffs.find((diff: { file: string }) => diff.file.endsWith("Tiltfile"))?.diff,
      ).toContain("+++ b/.tdk/.tdk-out/Tiltfile");
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  }, 20_000);

  it("emits a structured INTERNAL error and exits 2 for invalid project JSON", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-config-verify-invalid-"));
    try {
      fs.mkdirSync(path.join(projectRoot, ".tdk"), { recursive: true });
      fs.writeFileSync(path.join(projectRoot, ".tdk", "project.json"), "{invalid\n");

      const result = runVerify(projectRoot);

      expect(result.status).toBe(2);
      const lines = result.stdout.trim().split(/\r?\n/);
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toMatchObject({
        schemaVersion: 1,
        data: null,
        errors: [{ code: "INTERNAL" }],
      });
      expect(result.stderr).toContain("JSON");
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  }, 20_000);

  it("names a malformed service.json in the single JSON report and exits 1", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-config-verify-bad-service-"));
    try {
      fs.mkdirSync(path.join(projectRoot, ".tdk"), { recursive: true });
      fs.writeFileSync(
        path.join(projectRoot, ".tdk", "project.json"),
        JSON.stringify({
          version: "1.0",
          project: { name: "verify-bad-service", version: "1.0.0" },
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
        }),
      );
      const serviceDir = path.join(projectRoot, "services", "shop", "api");
      fs.mkdirSync(serviceDir, { recursive: true });
      fs.writeFileSync(path.join(serviceDir, "service.json"), "{invalid\n");

      const result = runVerify(projectRoot);

      expect(result.status).toBe(1);
      // The CLI may also warn on stderr about the skipped manifest; only stdout has to stay machine-readable.
      const lines = result.stdout.trim().split(/\r?\n/);
      expect(lines).toHaveLength(1);
      const report = JSON.parse(lines[0]);
      expect(report).toMatchObject({ schemaVersion: 1, data: { valid: false }, errors: [] });
      expect(report.data.errors).toContainEqual(
        expect.stringMatching(/^services\/shop\/api\/service\.json: invalid JSON \(/),
      );
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  }, 20_000);
});
