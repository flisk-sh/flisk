// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(__dirname, "../../../..");
export const cliBin = join(repoRoot, "cli", "bin", "tdk.js");

export function runTdk(args: string[], cwd: string, input?: string): string {
  return execFileSync(process.execPath, [cliBin, ...args], {
    cwd,
    encoding: "utf-8",
    input,
    env: {
      ...process.env,
      TDK_EXTENSION_SOURCE: repoRoot,
    },
  });
}

/** `tdk doctor` exits non-zero on machines without Docker, so read its output either way. */
export function runTdkAllowFailure(args: string[], cwd: string): string {
  const result = spawnSync(process.execPath, [cliBin, ...args], {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, TDK_EXTENSION_SOURCE: repoRoot },
  });
  return `${result.stdout}${result.stderr}`;
}

/**
 * Copies a project that `tdk project --yes` already generated into a fresh temp directory. Scaffolding costs
 * several seconds per run, so a file generates one base project in `beforeAll` and each test copies it instead.
 * Only use a copy for a test that starts from a generated project; a test that checks generation itself must
 * generate its own.
 */
export function copyProject(source: string): string {
  const target = mkdtempSync(join(tmpdir(), "tdk-project-copy-"));
  cpSync(source, target, { recursive: true });
  return target;
}

export function starlarkSection(content: string, name: string): string {
  const start = content.indexOf(`${name} = {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = content.indexOf("\n}", start);
  expect(end).toBeGreaterThan(start);
  return content.slice(start, end + 2);
}
