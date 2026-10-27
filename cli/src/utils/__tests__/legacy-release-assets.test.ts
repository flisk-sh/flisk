// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// `flisk upgrade` in 1.4.5 and older downloads these names from the latest flisk-sh/releases release and refuses a
// binary without a checksums.txt entry. The names are fixed in those shipped binaries, so this list must not change.
const LEGACY_UPGRADE_ASSETS = [
  "tdk-linux-amd64",
  "tdk-linux-arm64",
  "tdk-darwin-amd64",
  "tdk-darwin-arm64",
  "tdk-windows-amd64.exe",
  "tdk-cli-engine.tar.gz",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const helper = join(repoRoot, "scripts/lib/legacy-release-assets.sh");
const releaseScript = join(repoRoot, "scripts/release-binaries.sh");

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

function checksumEntries(dir: string): Map<string, string[]> {
  const entries = new Map<string, string[]>();
  for (const line of readFileSync(join(dir, "checksums.txt"), "utf8").trim().split("\n")) {
    const [hash, name] = line.split(/\s+/);
    entries.set(name, [...(entries.get(name) ?? []), hash]);
  }
  return entries;
}

describe("legacy tdk-* release assets", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  function fakeRelease(): string {
    dir = mkdtempSync(join(tmpdir(), "flisk-legacy-assets-"));
    const current = LEGACY_UPGRADE_ASSETS.map((name) => name.replace(/^tdk-/, "flisk-"));
    for (const name of current) writeFileSync(join(dir, name), `contents of ${name}\n`);
    const sums = spawnSync("shasum", ["-a", "256", ...current], { cwd: dir, encoding: "utf8" });
    expect(sums.status, sums.stderr).toBe(0);
    writeFileSync(join(dir, "checksums.txt"), sums.stdout);
    return dir;
  }

  function addLegacy(releaseDir: string) {
    return spawnSync(
      "bash",
      ["-c", 'source "$1" && add_legacy_release_assets "$2"', "_", helper, releaseDir],
      {
        encoding: "utf8",
      },
    );
  }

  it("declares exactly the names old binaries download", () => {
    const result = spawnSync(
      "bash",
      ["-c", 'source "$1" && printf "%s\\n" "${LEGACY_RELEASE_ASSETS[@]}"', "_", helper],
      {
        encoding: "utf8",
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual(LEGACY_UPGRADE_ASSETS);
  });

  it("copies each flisk-* asset to its tdk-* name byte for byte", () => {
    const releaseDir = fakeRelease();
    const result = addLegacy(releaseDir);
    expect(result.status, result.stderr).toBe(0);
    for (const legacy of LEGACY_UPGRADE_ASSETS) {
      const current = legacy.replace(/^tdk-/, "flisk-");
      expect(readFileSync(join(releaseDir, legacy), "utf8"), legacy).toBe(
        `contents of ${current}\n`,
      );
    }
  });

  it("adds one correct checksums.txt entry per tdk-* asset and keeps the flisk-* entries", () => {
    const releaseDir = fakeRelease();
    expect(addLegacy(releaseDir).status).toBe(0);
    const entries = checksumEntries(releaseDir);
    for (const legacy of LEGACY_UPGRADE_ASSETS) {
      const current = legacy.replace(/^tdk-/, "flisk-");
      expect(entries.get(legacy), legacy).toEqual([sha256(join(releaseDir, legacy))]);
      expect(entries.get(current), current).toEqual([sha256(join(releaseDir, current))]);
    }
    const verify = spawnSync("shasum", ["-a", "256", "-c", "checksums.txt"], {
      cwd: releaseDir,
      encoding: "utf8",
    });
    expect(verify.status, verify.stdout + verify.stderr).toBe(0);
  });

  it("fails when a flisk-* asset is missing instead of publishing a partial set", () => {
    const releaseDir = fakeRelease();
    rmSync(join(releaseDir, "flisk-darwin-arm64"));
    expect(addLegacy(releaseDir).status).not.toBe(0);
  });

  it("is built after the zip, validated, uploaded and verified by release-binaries.sh", () => {
    const script = readFileSync(releaseScript, "utf8");
    expect(script).toContain('source "${ROOT_DIR}/scripts/lib/legacy-release-assets.sh"');
    const zipAt = script.indexOf('zip -qr "flisk-cli-${RELEASE_TAG}-binaries.zip"');
    const addAt = script.indexOf('add_legacy_release_assets "${RELEASE_DIR}"');
    expect(zipAt).toBeGreaterThan(-1);
    expect(addAt).toBeGreaterThan(zipAt);
    expect(script).toContain(
      'flisk-windows-amd64.exe flisk-cli-engine.tar.gz "${LEGACY_RELEASE_ASSETS[@]}"; do',
    );
    expect(script).toContain('--clobber "${ASSETS[@]}" "${LEGACY_ASSET_PATHS[@]}"');
    expect(script).toContain('"${ASSETS[@]}" "${LEGACY_ASSET_PATHS[@]}"\nfi');
    expect(script).toContain(
      '"flisk-cli-${RELEASE_TAG}-binaries.zip" "${LEGACY_RELEASE_ASSETS[@]}"; do',
    );
  });
});
