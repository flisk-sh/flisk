// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync } from "node:fs";
/**
 * How to run this CLI again: `node <script>` / `bun <script>` when started from a script, or the executable alone when it is
 * a `bun build --compile` binary, whose argv[1] is a virtual path that exists only inside the binary.
 */
export function cliInvocation(execPath = process.execPath, script = process.argv[1], fileExists = existsSync) {
    if (!script || script.startsWith("/$bunfs/") || script.includes("~BUN") || !fileExists(script)) {
        return [execPath];
    }
    return [execPath, script];
}
