/** The first line of the block `flisk up` writes. A .gitignore that has it is never touched again, so a team can edit it. */
export declare const GENERATED_ROOT_BLOCK_START = "# >>> Flisk generated files in the repository root (#3030)";
/**
 * Adds the files Flisk generates in the repository root to the project's .gitignore, in one marked block, once (#3030):
 * the workspace `package.json` and the lockfiles beside it, `.tiltignore`, `shared-platform-engineering/` and the generated
 * `services/platform/database-management/docker-compose.yml`. Only inside a git work tree, and never for a path git already
 * tracks (a team's own `package.json` or `.tiltignore` stays as it is). An existing block is left alone, so deleting a
 * line is how a team keeps committing that file. Returns the entries it wrote.
 */
export declare function ensureGeneratedRootIgnored(projectRoot: string): string[];
