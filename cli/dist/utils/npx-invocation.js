// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync } from "node:fs";
import { win32 } from "node:path";
/**
 * Builds the npx call for `flisk export` and `flisk import` (#4004).
 *
 * Outside Windows npx is spawned directly. On Windows npx is a batch file (`npx.cmd`), and Node refuses to spawn a
 * batch file without a shell (CVE-2024-27980). A shell joins the arguments into one unquoted cmd.exe line, so a
 * path with a space splits in two and `&`, `|` or `%VAR%` in an argument are run or expanded by cmd.exe. So:
 *  - under node.exe, run npm's `npx-cli.js` with node itself: no shell, the arguments pass through untouched;
 *  - otherwise (the flisk binary, bun, an npm without npx-cli.js), run `npx.cmd` through cmd.exe with every
 *    argument quoted and caret-escaped, and tell Node not to quote the line again.
 */
export function npxInvocation(npxArgs, runtime = {}) {
    const platform = runtime.platform ?? process.platform;
    if (platform !== "win32") {
        return { command: "npx", args: npxArgs, shell: false, windowsVerbatimArguments: false };
    }
    const execPath = runtime.execPath ?? process.execPath;
    const exists = runtime.exists ?? existsSync;
    if (/^node(\.exe)?$/i.test(win32.basename(execPath))) {
        const npxCli = win32.join(win32.dirname(execPath), "node_modules", "npm", "bin", "npx-cli.js");
        if (exists(npxCli)) {
            return {
                command: execPath,
                args: [npxCli, ...npxArgs],
                shell: false,
                windowsVerbatimArguments: false,
            };
        }
    }
    const comSpec = runtime.comSpec ?? process.env.ComSpec ?? "cmd.exe";
    const line = ["npx.cmd", ...npxArgs.map(quoteCmdArgument)].join(" ");
    return {
        command: comSpec,
        args: ["/d", "/s", "/c", `"${line}"`],
        shell: false,
        windowsVerbatimArguments: true,
    };
}
const CMD_META_CHARS = /([()\][%!^"`<>&|;, *?])/g;
/**
 * Quotes one argument for a batch file run by `cmd.exe /d /s /c`: escape it for the C runtime argument parser that
 * node uses, wrap it in double quotes, then caret-escape cmd.exe metacharacters twice (once for the command line,
 * once more because the batch file re-parses `%*`). This is the method cross-spawn uses (MIT).
 */
export function quoteCmdArgument(arg) {
    // Backslashes before a double quote are doubled and the quote escaped; trailing backslashes are doubled
    // because the closing quote follows them.
    let quoted = arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1");
    quoted = `"${quoted}"`;
    quoted = quoted.replace(CMD_META_CHARS, "^$1");
    return quoted.replace(CMD_META_CHARS, "^$1");
}
