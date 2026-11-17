/** How to spawn `npx <args>` so every argument reaches npx exactly as given. */
export interface NpxInvocation {
    command: string;
    args: string[];
    shell: false;
    /** True when `args` is a ready cmd.exe line that Node must not quote again. */
    windowsVerbatimArguments: boolean;
}
export interface NpxRuntime {
    platform?: NodeJS.Platform;
    execPath?: string;
    exists?: (path: string) => boolean;
    comSpec?: string;
}
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
export declare function npxInvocation(npxArgs: string[], runtime?: NpxRuntime): NpxInvocation;
/**
 * Quotes one argument for a batch file run by `cmd.exe /d /s /c`: escape it for the C runtime argument parser that
 * node uses, wrap it in double quotes, then caret-escape cmd.exe metacharacters twice (once for the command line,
 * once more because the batch file re-parses `%*`). This is the method cross-spawn uses (MIT).
 */
export declare function quoteCmdArgument(arg: string): string;
/**
 * The npm package spec to run: the `FLISK_*_PACKAGE` override when it is a plain spec (name, version, path or URL),
 * else the pinned default. An override that starts with `-` (an npx option) or holds a space, quote or shell
 * metacharacter is ignored, so an environment value can never add options or commands to the npx call.
 */
export declare function safePackageSpec(override: string | undefined, fallback: string): string;
