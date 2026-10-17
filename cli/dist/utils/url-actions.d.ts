import { spawn } from "node:child_process";
export type SpawnFunction = typeof spawn;
/** Validates that a string is a safe HTTP or HTTPS URL before passing to system commands. */
export declare function isValidHttpUrl(candidate: string): boolean;
/**
 * Opens a URL in the user's default browser across platforms.
 * Uses `open` on macOS, `rundll32 url.dll,FileProtocolHandler` on Windows, and `xdg-open` on Linux.
 */
export declare function openUrl(url: string, platform?: string, spawnFn?: SpawnFunction): Promise<boolean>;
/**
 * Copies text to the system clipboard across platforms.
 * Uses `pbcopy` on macOS, `clip` on Windows, and `xclip` on Linux.
 */
export declare function copyToClipboard(text: string, platform?: string, spawnFn?: SpawnFunction): Promise<boolean>;
