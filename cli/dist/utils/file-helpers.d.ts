import type { FileGenerationTask } from "../types/index.js";
/**
 * Writes generated files. With `exclusive`, a file that already exists is never overwritten: the write fails
 * with a FliskError naming it, so a file that appeared after the folder was checked is left as it is.
 */
export declare function writeFilesWithProgress(basePath: string, tasks: FileGenerationTask[], onProgress?: (task: FileGenerationTask, index: number, total: number) => void, options?: {
    exclusive?: boolean;
}): void;
/**
 * Write JSON data to a file.
 * @param filePath - Path to the file
 * @param data - JSON-serializable data
 * @param space - Number of spaces for indentation (default: 2)
 */
export declare function writeJsonFile(filePath: string, data: unknown, space?: number): void;
export declare function writeJsonFileInDir(dir: string, filename: string, data: unknown, space?: number): void;
export declare function writeTextFile(filePath: string, content: string): void;
export declare function writeTextFileInDir(dir: string, filename: string, content: string): void;
export declare function ensureDirectory(dirPath: string): void;
/**
 * The checkout identity record. It names this machine's absolute checkout path, so it must never be committed the
 * way `.env` must not be; `ensureCheckoutRecordIgnored` enforces this one entry wherever a command writes the record.
 */
export declare const CHECKOUT_RECORD_GITIGNORE_ENTRY = ".flisk/.project-id";
/**
 * Appends the Flisk entries missing from the project's .gitignore (creating it
 * if needed), so the first `git add .` doesn't commit .env or generated
 * output. Returns the entries it added.
 */
export declare function ensureGitignore(projectRoot: string): string[];
/**
 * Makes sure the checkout identity record (`.flisk/.project-id`) cannot be committed by accident: it names this
 * machine's absolute checkout path. `flisk up`, `flisk down`, `flisk status` and `flisk config verify` all write it
 * without passing through project setup, so the entry is ensured here as well. Only that entry is added — not the
 * whole Flisk block from {@link ensureGitignore} — so a foreign or inferred project's .gitignore keeps its own
 * shape. Nothing is written outside a git working tree, and an unwritable .gitignore is left alone: the record still
 * works, it is only this machine's path that could end up tracked.
 */
export declare function ensureCheckoutRecordIgnored(projectRoot: string): string[];
/**
 * True when the path sits inside a git working tree: a `.git` directory in a clone, a `.git` file in a linked worktree.
 * Only then is an ignore entry worth writing.
 */
export declare function isInsideGitWorkTree(startPath: string): boolean;
/**
 * Makes sure the smoke records cannot be committed by accident: the project .gitignore must ignore `.flisk/smoke/` before
 * `flisk up` writes a record. Only meaningful inside a git working tree, so nothing is written outside one. Returns the
 * warning to show when the entry could not be ensured, and undefined when it is.
 */
export declare function ensureSmokeRecordsIgnored(projectRoot: string): string | undefined;
