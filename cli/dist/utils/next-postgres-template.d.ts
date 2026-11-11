import { type CliInvocation } from "./cli-invocation.js";
/**
 * The next-postgres starter: a Next.js website, an Express API and a Postgres database, with a migrator that creates and seeds the
 * `items` table and a working create, tick and delete page. It is composed from the real commands, not copied from a repository:
 * an empty `flisk project`, then three `flisk resource` calls (`--feature prisma` adds the `api-migrator` resource and makes the
 * API wait for it). The files below then replace the stub code those commands wrote. It needs Docker, because of Postgres.
 */
export declare const NEXT_POSTGRES_STACK = "app";
/** The commands that write the project, in order. Each runs inside the new project folder. */
export declare const NEXT_POSTGRES_STEPS: string[][];
/** Runs the project and resource commands with this CLI in `dir`; throws with the command's output when one fails. */
export declare function runNextPostgresSteps(dir: string, invocation?: CliInvocation): void;
/** Writes the files that replace the stubs, and removes the stub the page no longer uses. */
export declare function writeNextPostgresFiles(dir: string, readTemplate?: (name: string) => string): void;
/** Writes the whole next-postgres project into the empty folder `dir`. */
export declare function writeNextPostgresProject(dir: string): void;
