export interface ProjectTemplate {
    repo: string;
    description: string;
    bundledPath?: string;
    /** Written by the CLI itself from `cli/templates`, with no clone: `swarm` or `security`. */
    generated?: "swarm" | "security" | "super-agent";
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
 * The git invocations that fetch a repository template into `destination`: a clone and, for a pinned template, a
 * detached checkout of its exact commit.
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
