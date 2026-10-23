// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  isMachineOutputEnvelope,
  type MachineOutputEnvelope,
  SCHEMA_VERSION,
} from "../machine-output.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const cliBin = path.join(repoRoot, "cli", "bin", "tdk.js");

const MASTER_CONFIG_FILES = [
  "TILT_TECH_STACK.star",
  "TILT_RESOURCE_DEFAULTS.star",
  "spec.master",
  "docker-compose.yml",
];

describe("machine output contract: every --json command emits the standard envelope", () => {
  let projectRoots: string[] = [];

  afterEach(() => {
    for (const projectRoot of projectRoots) {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
    projectRoots = [];
  });

  function createProject(): string {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-machine-contract-"));
    projectRoots.push(projectRoot);

    // .tdk/project.json
    fs.mkdirSync(path.join(projectRoot, ".tdk"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, ".tdk", "project.json"),
      JSON.stringify({ project: { name: "test-project" } }),
    );

    // Master config files in .tdk/.tdk-out
    const outDir = path.join(projectRoot, ".tdk", ".tdk-out");
    fs.mkdirSync(outDir, { recursive: true });
    for (const file of MASTER_CONFIG_FILES) {
      fs.writeFileSync(path.join(outDir, file), "# generated\n");
    }

    // A sample service: services/shop/api
    const apiDir = path.join(projectRoot, "services", "shop", "api");
    fs.mkdirSync(apiDir, { recursive: true });
    fs.writeFileSync(
      path.join(apiDir, "service.json"),
      JSON.stringify({
        appName: "api",
        appType: "backend",
        stack: "shop",
        port: 4000,
        schemaVersion: 1,
      }),
    );

    return projectRoot;
  }

  function runCli(args: string[], cwd: string) {
    return spawnSync(process.execPath, [cliBin, ...args], {
      cwd,
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
  }

  function assertStandardEnvelope(stdout: string): MachineOutputEnvelope {
    const text = stdout.trim();
    // Parse the JSON envelope (handle either single line or multiline JSON like projects)
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Find the last JSON block/line
      const lines = text.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
      expect(lines.length).toBeGreaterThan(0);
      parsed = JSON.parse(lines[lines.length - 1] as string);
    }

    expect(isMachineOutputEnvelope(parsed)).toBe(true);
    const envelope = parsed as MachineOutputEnvelope;
    expect(Object.keys(envelope).sort()).toEqual(["data", "errors", "schemaVersion"].sort());
    expect(envelope.schemaVersion).toBe(SCHEMA_VERSION);
    expect(Array.isArray(envelope.errors)).toBe(true);
    for (const err of envelope.errors) {
      expect(typeof err.code).toBe("string");
      expect(typeof err.message).toBe("string");
    }
    return envelope;
  }

  it.each([
    ["projects", ["projects", "--json"]],
    ["stacks", ["stacks", "--json"]],
    ["resources", ["resources", "--json"]],
    ["status", ["status", "--json"]],
    ["networks", ["networks", "--json"]],
    ["doctor", ["doctor", "--json", "--no-ping"]],
    ["config verify", ["config", "verify", "--json"]],
  ])(
    "command '%s' emits standard machine envelope with schemaVersion, data, errors",
    (_, args) => {
      const projectRoot = createProject();
      const result = runCli(args, projectRoot);
      const envelope = assertStandardEnvelope(result.stdout);
      expect(envelope.schemaVersion).toBe(1);
    },
    60_000,
  );
});
