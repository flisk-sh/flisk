/**
 * Intent-based suggestions for common top-level words users type that are not spelling
 * typos of the actual command name (#4491). Spelling-based suggestions remain in place
 * for every other command name.
 */
export declare const UNKNOWN_COMMAND_SUGGESTIONS: Readonly<Record<string, readonly string[]>>;
export declare function formatDidYouMean(targets: readonly string[]): string;
/**
 * Replaces Commander's spelling-based suggestion on `error: unknown command '<word>'`
 * when `<word>` has an explicit intent mapping, preserving Commander's spelling suggestion
 * for every other unknown command.
 */
export declare function rewriteUnknownCommandMessage(message: string): string;
