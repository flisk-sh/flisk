// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runtimeCommand } from "../runtime.js";

const templateEngine = vi.hoisted(() => ({
  findCliAssetRoot: vi.fn<() => string | null>(),
  loadTemplate: vi.fn<(filename: string) => string>(),
}));

vi.mock("../../generator/template-engine.js", () => templateEngine);

interface CheckAssetsResult {
  ok: boolean;
  assetRoot: string | null;
  missing: string[];
  templateErrors: string[];
}

const EXPECTED_ASSET_PATHS = [
  "Tiltfile",
  "engine",
  "discovery",
  "specs",
  "ext",
  "cli/templates",
  "shared-platform-engineering/docker-templates",
];

const JSON_KEYS = ["assetRoot", "missing", "ok", "templateErrors"];

/** Builds a directory that has every path `flisk runtime --check-assets` requires. */
function createCompleteAssetRoot(root: string): void {
  writeFileSync(join(root, "Tiltfile"), "");
  for (const directory of EXPECTED_ASSET_PATHS.filter((path) => path !== "Tiltfile")) {
    mkdirSync(join(root, directory), { recursive: true });
  }
}

/** Runs `flisk runtime <args>` and returns everything it printed to stdout and stderr. */
async function runRuntime(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    stdout.push(parts.join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
    stderr.push(parts.join(" "));
  });
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    stdout.push(String(chunk));
    return true;
  });

  await runtimeCommand.parseAsync(args, { from: "user" });
  return { stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

describe("flisk runtime", () => {
  let tempDir: string;

  beforeEach(() => {
    templateEngine.findCliAssetRoot.mockReset();
    templateEngine.loadTemplate.mockReset();
    process.exitCode = undefined;
    tempDir = mkdtempSync(join(tmpdir(), "tdk-runtime-assets-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("prints help and sets exit code 2 when --check-assets is not given", async () => {
    const { stdout } = await runRuntime([]);

    expect(stdout).toContain("--check-assets");
    expect(stdout).toContain("--json");
    expect(process.exitCode).toBe(2);
    expect(templateEngine.findCliAssetRoot).not.toHaveBeenCalled();
  });

  it("prints { ok, assetRoot, missing, templateErrors } as JSON when every asset is present", async () => {
    createCompleteAssetRoot(tempDir);
    templateEngine.findCliAssetRoot.mockReturnValue(tempDir);
    templateEngine.loadTemplate.mockReturnValue("");

    const { stdout } = await runRuntime(["--check-assets", "--json"]);
    const result = JSON.parse(stdout) as CheckAssetsResult;

    expect(Object.keys(result).sort()).toEqual(JSON_KEYS);
    expect(result).toEqual({
      ok: true,
      assetRoot: resolve(tempDir),
      missing: [],
      templateErrors: [],
    });
    expect(process.exitCode).toBeUndefined();
  });

  it("reports every missing asset and sets exit code 1 when the asset root is empty", async () => {
    templateEngine.findCliAssetRoot.mockReturnValue(tempDir);

    const { stdout } = await runRuntime(["--check-assets", "--json"]);
    const result = JSON.parse(stdout) as CheckAssetsResult;

    expect(Object.keys(result).sort()).toEqual(JSON_KEYS);
    expect(result.ok).toBe(false);
    expect(result.assetRoot).toBe(resolve(tempDir));
    expect(result.missing).toEqual(EXPECTED_ASSET_PATHS);
    expect(result.templateErrors).toEqual([]);
    expect(process.exitCode).toBe(1);
  });
});
