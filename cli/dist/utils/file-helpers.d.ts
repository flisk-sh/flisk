import type { FileGenerationTask } from "../types/index.js";
export declare function writeFilesWithProgress(basePath: string, tasks: FileGenerationTask[], onProgress?: (task: FileGenerationTask, index: number, total: number) => void): void;
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
 * Appends the Flisk entries missing from the project's .gitignore (creating it
 * if needed), so the first `git add .` doesn't commit .env or generated
 * output. Returns the entries it added.
 */
export declare function ensureGitignore(projectRoot: string): string[];
/**
 * True when the path sits inside a git working tree: a `.git` directory in a clone, a `.git` file in a linked worktree.
 * Only then is an ignore entry worth writing.
 */
export declare function isInsideGitWorkTree(startPath: string): boolean;
/**
 * Makes sure the smoke records cannot be committed by accident: the project .gitignore must ignore `.tdk/smoke/` before
 * `flisk up` writes a record. Only meaningful inside a git working tree, so nothing is written outside one. Returns the
 * warning to show when the entry could not be ensured, and undefined when it is.
 */
export declare function ensureSmokeRecordsIgnored(projectRoot: string): string | undefined;
