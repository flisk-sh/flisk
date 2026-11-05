/**
 * The message native Windows gets when a command needs a stack.
 *
 * Native Windows runs services that declare a `command` as local processes, and `flisk demo` falls back
 * to its local-process demo. For a container stack it is inspection-only: `flisk --version`, `flisk doctor`
 * and `flisk up --dry-run` work, and starting the stack needs Ubuntu on WSL2. `flisk up` and the
 * one-command flow of a Docker starter refuse with this message before they touch the machine.
 */
export declare const NATIVE_WINDOWS_REFUSAL = "Landscape startup needs Ubuntu on WSL2. Native Windows runs only services that declare a command, as local processes.";
export declare const WINDOWS_GUIDE_URL = "https://github.com/flisk-sh/flisk/blob/main/docs/setup/windows.md";
/**
 * The one next step for someone on native Windows: open Ubuntu (WSL2) and run Flisk there, with the exact commands.
 */
export declare const NATIVE_WINDOWS_NEXT_STEP: string;
/** The refusal plus the next step, as `flisk up` prints it. */
export declare const NATIVE_WINDOWS_REFUSAL_WITH_NEXT_STEP: string;
/**
 * Why a command that starts a stack cannot run on this host, or null when it may proceed.
 *
 * `FLISK_ALLOW_NATIVE_WINDOWS=1` is the unsupported escape hatch that lets it try anyway.
 */
export declare function nativeWindowsStackRefusal(platform: string, allowNativeWindows?: string): string | null;
/**
 * What `flisk import` tells someone on native Windows before it imports, or null elsewhere.
 *
 * Import itself works in PowerShell, so it is not refused. But Windows users who forked a Docker app read this nowhere until
 * `flisk up` refused, after they had imported and set up the project on the Windows side (#3246). This says it up front.
 * `FLISK_ALLOW_NATIVE_WINDOWS=1` (the unsupported escape hatch) silences it, like the refusal.
 */
export declare function nativeWindowsImportNotice(platform: string, allowNativeWindows?: string): string | null;
