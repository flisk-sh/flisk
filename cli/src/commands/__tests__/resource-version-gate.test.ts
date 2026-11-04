// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runFlisk } from "../../test-support/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../..");

const temporaryRoots: string[] = [];

function createPinnedProject(): string {
  const projectRoot = mkdtempSync(join(tmpdir(), "flisk-resource-version-gate-"));
  temporaryRoots.push(projectRoot);

  const init = runFlisk(["project", "--yes"], {
    cwd: projectRoot,
    env: { FLISK_EXTENSION_SOURCE: repoRoot },
  });

  if (init.status !== 0) {
    throw new Error(`Project initialization failed:\n${init.stderr}`);
  }

  const projectJsonPath = join(projectRoot, ".flisk", "project.json");
  const project = JSON.parse(readFileSync(projectJsonPath, "utf-8"));

  project.pinnedFliskVersion = "999.999.999";

  writeFileSync(projectJsonPath, `${JSON.stringify(project, null, 2)}\n`);

  return projectRoot;
}

function runResource(args: string[], cwd: string, input?: string) {
  return runFlisk(args, {
    cwd,
    input,
    env: { FLISK_EXTENSION_SOURCE: repoRoot },
  });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    if (root.startsWith(tmpdir())) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("resource version gate", () => {
  it("rejects resource creation when the pinned CLI version does not match", () => {
    const projectRoot = createPinnedProject();

    const result = runResource(
      [
        "resource",
        "storefront",
        "--type",
        "frontend",
        "--stack",
        "shop",
        "--path",
        "apps/storefront",
      ],
      projectRoot,
    );

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain("pinnedFliskVersion");
    expect(`${result.stdout}\n${result.stderr}`).toContain("999.999.999");
    expect(existsSync(join(projectRoot, "apps", "storefront", "service.json"))).toBe(false);
  });

  it("allows resource creation with --ignore-version", () => {
    const projectRoot = createPinnedProject();

    const result = runResource(
      [
        "resource",
        "storefront",
        "--type",
        "frontend",
        "--stack",
        "shop",
        "--path",
        "apps/storefront",
        "--ignore-version",
      ],
      projectRoot,
      "y\n",
    );

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("--ignore-version");
    expect(existsSync(join(projectRoot, "apps", "storefront", "service.json"))).toBe(true);
  });

  it("returns a JSON error when resource creation is blocked by the pin", () => {
    const projectRoot = createPinnedProject();

    const result = runResource(
      [
        "resource",
        "storefront",
        "--type",
        "frontend",
        "--stack",
        "shop",
        "--path",
        "apps/storefront",
        "--json",
      ],
      projectRoot,
    );

    expect(result.status).toBe(1);

    const envelope = JSON.parse(result.stdout);
    expect(JSON.stringify(envelope)).toContain("pinnedFliskVersion");
    expect(existsSync(join(projectRoot, "apps", "storefront", "service.json"))).toBe(false);
  });

  it("keeps resource --frameworks exempt from the version gate", () => {
    const projectRoot = createPinnedProject();

    const result = runResource(["resource", "--frameworks"], projectRoot);

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("pinnedFliskVersion");
  });

  it("keeps resource --frameworks --json exempt and machine-readable", () => {
    const projectRoot = createPinnedProject();

    const result = runResource(["resource", "--frameworks", "--json"], projectRoot);

    expect(result.status).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("pinnedFliskVersion");
  });
});
