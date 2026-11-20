/**
 * Derives the default `project.name` from a project root on any host.
 *
 * `node:path.basename` uses the host OS's separator: on POSIX it does not split
 * `C:\Users\me\work\shop`, so the whole path became the Docker project name.
 * Normalizing separators and parsing with the win32 rules accepts both `/` and
 * `\`, strips trailing separators, and recognizes drive and UNC roots on any
 * host.
 */
export declare function deriveProjectName(projectRoot: string): string;
