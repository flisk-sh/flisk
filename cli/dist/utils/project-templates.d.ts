export interface ProjectTemplate {
    repo: string;
    description: string;
    bundledPath?: string;
    /** Written by the CLI itself from `cli/templates`, with no clone: `swarm` or `security`. */
    generated?: "swarm" | "security" | "super-agent" | "langgraph" | "tool-loop";
    /** Written by running `flisk project` and `flisk resource` in the new folder, then adding files; needs Docker. */
    composed?: "next-postgres";
    fixedDir?: string;
    /** A commit SHA: project creation checks out exactly this commit after cloning, instead of the default branch. */
    ref?: string;
}
/** One row of the template catalog that `flisk project --list --json` and the `project_templates` MCP tool return. */
export interface ProjectTemplateEntry {
    key: string;
    repo: string;
    description: string;
    ref?: string;
}
/** Public starter repositories plus the bundled default product example. */
export declare const PROJECT_TEMPLATES: Record<string, ProjectTemplate>;
/** The template catalog in registration order: key, repo, description and, for a pinned template, its ref. */
export declare function listProjectTemplates(): ProjectTemplateEntry[];
/**
 * The folder a starter lands in: the requested path, or its default folder. A starter that the
 * CLI writes itself (generated or composed) defaults to its own name; one cloned from a repository
 * defaults to that repository's name. Those six starters all point at the main `flisk-sh/flisk`
 * repository, so its name is not a useful folder: two of them would collide as `flisk/`.
 *
 * Every caller uses this function, so the printed next steps, the JSON result and the folder on
 * disk cannot disagree.
 */
export declare function templateTargetDir(templateName: string, targetDir?: string): string;
/**
 * Fetches a repository template into `destination` and keeps its source as `upstream`.
 * Unpinned templates need only the latest commit; pinned templates retain the history needed to
 * check out their exact commit. The pinned commit is reached by moving the cloned default branch
 * onto it, not by a detached checkout: a beginner's first commits on a detached HEAD belong to no
 * branch and are lost on the next `git switch` (#4286).
 */
export declare function templateGitCommands(template: ProjectTemplate, destination: string): string[][];
/**
 * The template of the one-command flow (`flisk demo`), read from the raw arguments.
 *
 * Only the first argument can name a template. A command that takes a template of its
 * own — `flisk project demo` clones a starter and configures it, `flisk up demo` is not a
 * command at all — is that command, not the one-command flow. Looking further down the
 * arguments hijacked every command that mentioned a template name anywhere.
 */
export declare function bareTemplateArg(args: string[]): string | undefined;
/** Where a bundled example can live: the npm/source package root, the engine bundle next to a compiled binary, an installed dependency. */
export declare function bundledTemplateRootCandidates(roots: {
    packageRoot: string;
    exeDir: string;
    workingDir: string;
}): string[];
/**
 * The first candidate that really holds `bundledPath`, or null. A `bun build --compile`
 * binary has no package root (import.meta.url resolves to /), so the engine bundle
 * beside the executable is the one that matches there (#3880).
 */
export declare function resolveBundledTemplateDir(bundledPath: string, roots: {
    packageRoot: string;
    exeDir: string;
    workingDir: string;
}, exists?: (path: string) => boolean): string | null;
