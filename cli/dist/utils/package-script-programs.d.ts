/**
 * Resolves what a service `command` actually starts, one level into the service's
 * own package.json (#4680). A command such as `npm run dev` starts npm, but the
 * program that can be missing is the first program of `scripts.dev` (`bun run
 * --watch src/index.ts` -> `bun`). Doctor and `flisk up` must name that program
 * before the first start, instead of reporting `ready: true` and then seeing the
 * service exit 127 five times.
 *
 * Only one level is followed: a script that itself says `npm run build` is not
 * resolved again. That keeps the check read-only, bounded, and independent of
 * generated files -- it reads the author's package.json and nothing else.
 */
/** Programs the shell runs itself, so they cannot be missing from PATH. */
export declare const SHELL_BUILTIN_PROGRAMS: Set<string>;
/** The first program of each `&&`-separated part of a shell command line. */
export declare function commandPrograms(command: string): string[];
/**
 * The package.json script a command part delegates to, when it is one of the
 * supported forms: `npm run <script>`, `yarn <script>`, `yarn run <script>`,
 * `pnpm <script>`, `pnpm run <script>` or `bun run <script>`. Leading
 * `VAR=value` assignments and `exec`/`env` prefixes are ignored, as in
 * `commandProgram`. Returns null for everything else.
 */
export declare function scriptOfCommand(command: string): string | null;
/** Reads `scripts.<name>` from the service's own package.json, or null when absent or unreadable. */
export declare function readPackageScript(cwd: string, script: string, readFile?: (path: string) => string): string | null;
/** A program a service needs, tagged with the script it came from when it was followed one level. */
export interface ServiceProgram {
    program: string;
    script?: string;
}
/**
 * Every program to check for one service command: the first program of each
 * `&&` part, plus the first program of each `&&` part of any package-manager
 * script it delegates to. Deduplicated so a script using `bun` twice reports it
 * once.
 */
export declare function programsForServiceCommand(cwd: string, command: string, readFile?: (path: string) => string): ServiceProgram[];
/** Where a missing program can be installed, for the failure guidance. */
export declare function installGuidance(program: string): string;
