// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
const __dirname = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(__dirname, "../../../..");
export const cliBin = join(repoRoot, "cli", "bin", "flisk.js");
export function runTdk(args, cwd, input) {
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
/** `flisk doctor` exits non-zero on machines without Docker, so read its output either way. */
export function runTdkAllowFailure(args, cwd) {
    const result = spawnSync(process.execPath, [cliBin, ...args], {
        cwd,
        encoding: "utf-8",
        env: { ...process.env, TDK_EXTENSION_SOURCE: repoRoot },
    });
    return `${result.stdout}${result.stderr}`;
}
/**
 * Copies a project that `flisk project --yes` already generated into a fresh temp directory. Scaffolding costs
 * several seconds per run, so a file generates one base project in `beforeAll` and each test copies it instead.
 * Only use a copy for a test that starts from a generated project; a test that checks generation itself must
 * generate its own.
 */
export function copyProject(source) {
    const target = mkdtempSync(join(tmpdir(), "flisk-project-copy-"));
    cpSync(source, target, { recursive: true });
    return target;
}
export function starlarkSection(content, name) {
    const start = content.indexOf(`${name} = {`);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = content.indexOf("\n}", start);
    expect(end).toBeGreaterThan(start);
    return content.slice(start, end + 2);
}
