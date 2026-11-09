/** The executable that runs this CLI, then whatever it needs before the CLI's own arguments. */
export type CliInvocation = [command: string, ...prefix: string[]];
/**
 * How to run this CLI again: `node <script>` / `bun <script>` when started from a script, or the executable alone when it is
 * a `bun build --compile` binary, whose argv[1] is a virtual path that exists only inside the binary.
 */
export declare function cliInvocation(execPath?: string, script?: string | undefined, fileExists?: (path: string) => boolean): CliInvocation;
