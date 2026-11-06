export interface DemoRootOptions {
    template?: string;
    project?: string;
    keep: boolean;
    help: boolean;
    yes: boolean;
    /** Set when `--project` is present but its value cannot be a directory. */
    projectError?: string;
}
/**
 * Reads the root options of the one-command flow: `flisk <template> [options]` and
 * `flisk --template <name> [options]`. Scanning stops at the first subcommand or at `--`, so
 * `flisk run x -- tool --template=y` never starts the demo.
 */
export declare function parseDemoRootOptions(argv: string[]): DemoRootOptions;
/** Why a `--project` value cannot be used as a directory, or undefined when it can. */
export declare function projectDestinationError(value: string | undefined): string | undefined;
/**
 * Ports to look at for this project's Tilt: the one set in the environment, the one a
 * previous `flisk up` saved, then the default range.
 */
export declare function tiltWatchPorts(saved: number | null | undefined, env?: NodeJS.ProcessEnv): number[];
