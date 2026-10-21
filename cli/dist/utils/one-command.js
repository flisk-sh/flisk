// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawn } from "node:child_process";
/** The marker the stack prints before the frontend URLs. */
const FRONTEND_MARKER = "Frontend URLs";
/** Picks the first frontend URL out of the `flisk up` output, if it printed one. */
export function findFrontendUrl(output) {
    const lines = output.split("\n");
    const markerIndex = lines.findIndex((line) => line.includes(FRONTEND_MARKER));
    if (markerIndex === -1)
        return undefined;
    for (const line of lines.slice(markerIndex + 1)) {
        const match = line.match(/^\s*-\s+\S+:\s+(https?:\/\/\S+)/);
        if (match)
            return match[1];
        if (line.trim() === "" || line.includes("URLs:"))
            break;
    }
    return undefined;
}
/**
 * Runs `flisk up` in the project directory and streams its output to the terminal. The stack
 * keeps running in the foreground, so the caller is told about the frontend URL as soon as it
 * shows up instead of waiting for the process to exit.
 */
export function runStack(binPath, cwd, env = process.env, spawnFn = spawn, onFrontendUrl) {
    return new Promise((resolve) => {
        const child = spawnFn(process.execPath, [binPath, "up"], {
            cwd,
            env,
            stdio: ["inherit", "pipe", "inherit"],
        });
        let output = "";
        let announced = false;
        child.stdout?.on("data", (chunk) => {
            const text = String(chunk);
            output += text;
            process.stdout.write(text);
            if (!announced) {
                const url = findFrontendUrl(output);
                if (url) {
                    announced = true;
                    onFrontendUrl?.(url);
                }
            }
        });
        child.on("error", (error) => resolve({ code: 1, output: `${output}\n${error.message}` }));
        child.on("close", (code) => resolve({ code, output }));
    });
}
