// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FliskError } from "./errors.js";
/**
 * Extracts a gzipped tarball (as an in-memory buffer) into destDir.
 * Shells out to the system `tar` binary rather than pulling in a JS tar
 * implementation - available by default on macOS and Linux. On Windows it
 * runs `tar.exe`, which ships with Windows 10 (1803) and later; see
 * docs/windows-hardware.md.
 */
export function extractTarball(data, destDir) {
    const tempDir = mkdtempSync(join(tmpdir(), "flisk-ext-"));
    try {
        const tmpFile = join(tempDir, "bundle.tar.gz");
        writeFileSync(tmpFile, data);
        mkdirSync(destDir, { recursive: true });
        const tarBin = process.platform === "win32" ? "tar.exe" : "tar";
        const result = spawnSync(tarBin, ["xzf", tmpFile, "-C", destDir, "--strip-components=1"], {
            stdio: "pipe",
            windowsHide: true,
        });
        if (result.status !== 0) {
            const fallbackDir = join(tempDir, "fallback");
            mkdirSync(fallbackDir, { recursive: true });
            const fallback = spawnSync(tarBin, ["xzf", tmpFile, "-C", fallbackDir], {
                stdio: "pipe",
                windowsHide: true,
            });
            if (fallback.status !== 0) {
                throw new FliskError(`tar extraction failed: ${fallback.stderr?.toString() || result.stderr?.toString() || "unknown error"}`, ["Check that tar is installed and the download finished", "Run the command again"]);
            }
            const entries = readdirSync(fallbackDir);
            const [only] = entries;
            const sourceDir = entries.length === 1 &&
                only !== undefined &&
                existsSync(join(fallbackDir, only)) &&
                statSync(join(fallbackDir, only)).isDirectory()
                ? join(fallbackDir, only)
                : fallbackDir;
            for (const entry of readdirSync(sourceDir)) {
                renameSync(join(sourceDir, entry), join(destDir, entry));
            }
        }
    }
    finally {
        rmSync(tempDir, { recursive: true, force: true });
    }
}
