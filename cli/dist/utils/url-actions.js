// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { spawn } from "node:child_process";
/** Validates that a string is a safe HTTP or HTTPS URL before passing to system commands. */
export function isValidHttpUrl(candidate) {
    try {
        const parsed = new URL(candidate);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    }
    catch {
        return false;
    }
}
/**
 * Opens a URL in the user's default browser across platforms.
 * Uses `open` on macOS, `rundll32 url.dll,FileProtocolHandler` on Windows, and `xdg-open` on Linux.
 */
export function openUrl(url, platform = process.platform, spawnFn = spawn) {
    if (!isValidHttpUrl(url)) {
        return Promise.resolve(false);
    }
    let cmd;
    let args;
    if (platform === "darwin") {
        cmd = "open";
        args = [url];
    }
    else if (platform === "win32") {
        // Avoid cmd.exe: it treats & | ^ < > in the URL as shell syntax.
        cmd = "rundll32.exe";
        args = ["url.dll,FileProtocolHandler", url];
    }
    else {
        cmd = "xdg-open";
        args = [url];
    }
    return new Promise((resolve) => {
        try {
            const child = spawnFn(cmd, args, {
                stdio: "ignore",
                detached: true,
                windowsHide: true,
            });
            child.once("error", () => resolve(false));
            child.once("spawn", () => {
                if (typeof child.unref === "function") {
                    child.unref();
                }
                resolve(true);
            });
        }
        catch {
            resolve(false);
        }
    });
}
/**
 * Copies text to the system clipboard across platforms.
 * Uses `pbcopy` on macOS, `clip` on Windows, and `xclip` on Linux.
 */
export function copyToClipboard(text, platform = process.platform, spawnFn = spawn) {
    return new Promise((resolve) => {
        let cmd;
        let args;
        if (platform === "darwin") {
            cmd = "pbcopy";
            args = [];
        }
        else if (platform === "win32") {
            cmd = "clip";
            args = [];
        }
        else {
            cmd = "xclip";
            args = ["-selection", "clipboard"];
        }
        try {
            const child = spawnFn(cmd, args, {
                stdio: ["pipe", "ignore", "ignore"],
                windowsHide: true,
            });
            child.on("error", () => {
                resolve(false);
            });
            child.on("close", (code) => {
                resolve(code === 0);
            });
            if (child.stdin) {
                child.stdin.on("error", () => {
                    resolve(false);
                });
                child.stdin.write(text, "utf-8");
                child.stdin.end();
            }
            else {
                resolve(false);
            }
        }
        catch {
            resolve(false);
        }
    });
}
