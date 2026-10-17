export declare const repoRoot: string;
export declare const cliBin: string;
export declare function runTdk(args: string[], cwd: string, input?: string): string;
/** `tdk doctor` exits non-zero on machines without Docker, so read its output either way. */
export declare function runTdkAllowFailure(args: string[], cwd: string): string;
/**
 * Copies a project that `tdk project --yes` already generated into a fresh temp directory. Scaffolding costs
 * several seconds per run, so a file generates one base project in `beforeAll` and each test copies it instead.
 * Only use a copy for a test that starts from a generated project; a test that checks generation itself must
 * generate its own.
 */
export declare function copyProject(source: string): string;
export declare function starlarkSection(content: string, name: string): string;
