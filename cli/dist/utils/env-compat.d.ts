/**
 * Bridges the TDK_* → FLISK_* rename. FLISK_X is the preferred name; the engine and
 * subprocesses (Tilt, Starlark) still read TDK_X, so FLISK_X is mirrored onto TDK_X
 * unless TDK_X is already set. Returns the legacy names that were used without a
 * FLISK_ equivalent, so callers can print one deprecation notice.
 */
export declare function applyEnvAliases(env: NodeJS.ProcessEnv): string[];
