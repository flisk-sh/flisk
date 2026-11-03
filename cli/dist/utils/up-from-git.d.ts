import { type GitRunner } from "./project-repos.js";
/**
 * True when the `flisk up` argument is a git repository URL rather than a stack name: a URL with a scheme
 * (https://, ssh://, git://, file://) or SCP-like syntax (git@github.com:org/repo). Stack names never contain ":".
 */
export declare function isGitRepoArg(arg: string | undefined): arg is string;
/** The directory a repository URL clones into, as `git clone` names it: the last path segment without `.git`. */
export declare function repoDirName(url: string): string;
/**
 * Clones `url` into `<cwd>/<repo name>` (shallow) and returns that folder, so `flisk up <url>` starts it in one command.
 * A folder that already holds a git checkout is reused as it is (no pull); any other non-empty folder is refused.
 */
export declare function cloneForUp(url: string, options?: {
    cwd?: string;
    git?: GitRunner;
    log?: (line: string) => void;
}): Promise<string>;
