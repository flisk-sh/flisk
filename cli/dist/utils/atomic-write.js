// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { randomBytes } from "node:crypto";
import { closeSync, fchmodSync, fsyncSync, openSync, renameSync, rmSync, statSync, writeFileSync, } from "node:fs";
import { basename, dirname, join } from "node:path";
/**
 * Replaces `filePath` in one step. A plain writeFileSync truncates first, so an interrupt mid-write leaves a
 * half-written file that looks current; here readers see the old content or the new content, never a mix.
 */
export function writeTextFileAtomic(filePath, content) {
    const tempPath = join(dirname(filePath), `.${basename(filePath)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
    let mode;
    try {
        mode = statSync(filePath).mode & 0o777;
    }
    catch {
        mode = undefined;
    }
    try {
        const fd = openSync(tempPath, "wx");
        try {
            if (mode !== undefined)
                fchmodSync(fd, mode);
            writeFileSync(fd, content, "utf-8");
            fsyncSync(fd);
        }
        finally {
            closeSync(fd);
        }
        renameSync(tempPath, filePath);
    }
    catch (error) {
        rmSync(tempPath, { force: true });
        throw error;
    }
}
