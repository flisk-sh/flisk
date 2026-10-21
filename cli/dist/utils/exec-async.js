// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import { findOnPath } from "./which.js";
const execPromise = promisify(exec);
export const execAsync = async (command, timeoutMs) => {
    if (process.platform === "win32") {
        // Doctor commands are simple executable/argument invocations. Tokenize
        // their quoted arguments and bypass cmd.exe/PowerShell entirely.
        const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
        const [parsedFile, ...args] = parts.map((part) => part.startsWith('"') || part.startsWith("'") ? part.slice(1, -1) : part);
        if (!parsedFile)
            throw new Error("Command is empty");
        const file = findOnPath(parsedFile) ?? parsedFile;
        const { stdout } = await promisify(execFile)(file, args, {
            encoding: "utf-8",
            timeout: timeoutMs,
            windowsHide: true,
            shell: false,
        });
        return stdout;
    }
    const { stdout } = await execPromise(command, { encoding: "utf-8", timeout: timeoutMs });
    return stdout;
};
/** `exec` kills a timed-out child and sets `killed`; `execSync` reports ETIMEDOUT. */
export function isExecTimeout(err) {
    const e = err;
    return e?.code === "ETIMEDOUT" || e?.killed === true;
}
