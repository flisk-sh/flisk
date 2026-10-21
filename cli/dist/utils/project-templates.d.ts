export interface ProjectTemplate {
    repo: string;
    description: string;
    bundledPath?: string;
    fixedDir?: string;
}
/** Public starter repositories plus the bundled default product example. */
export declare const PROJECT_TEMPLATES: Record<string, ProjectTemplate>;
/**
 * The template of the one-command flow (`flisk demo`), read from the raw arguments.
 *
 * Only the first argument can name a template. A command that takes a template of its
 * own — `flisk project demo` clones a starter and configures it, `flisk up demo` is not a
 * command at all — is that command, not the one-command flow. Looking further down the
 * arguments hijacked every command that mentioned a template name anywhere.
 */
export declare function bareTemplateArg(args: string[]): string | undefined;
