/**
 * Removes presentation-only paths from a cloned starter, along with the README links that point at
 * them. Templates live in their own repositories and are copied whole (#4285, #4301); this keeps
 * sales decks and demo media out of a user's first commit without pinning every template to a new
 * release. Paths are relative to the template root and may name a file or a directory.
 *
 * Returns the paths that were actually removed, so callers can log or test what happened.
 */
export declare function stripTemplateExtras(root: string, omitted: readonly string[]): string[];
