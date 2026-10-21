/** The command users install and type. */
export declare const CLI_COMMAND = "flisk";
/** The npm package that installs it. */
export declare const CLI_PACKAGE = "@flisk-sh/flisk";
/** The package the CLI was published under before the rename. It owns the old `flisk` command. */
export declare const LEGACY_PACKAGE = "@tdk-landscape/tdk-cli-core";
/** True when the command can be typed as-is, so `flisk ...` resolves. */
export declare function isCommandOnPath(command?: string, env?: NodeJS.ProcessEnv): boolean;
/**
 * A folder to start a project in. It follows the platform convention: Documents when the
 * machine has one, a plain folder in the home directory otherwise.
 */
export declare function suggestedWorkspace(env?: NodeJS.ProcessEnv): string;
/** True when the directory holds no visible entries, so a project can start there as-is. */
export declare function isEmptyWorkspace(dir: string): boolean;
/**
 * The next step to print once the machine is ready.
 *
 * An ephemeral run (`npx @flisk-sh/flisk`) never installs the command, so pointing at
 * `flisk ...` there would fail with "command not found"; that case says how to install it
 * instead. A project also should not start in whatever folder the shell happens to be in,
 * so a directory that already holds files gets a workspace to move into first.
 */
export declare function readyNextStep(env?: NodeJS.ProcessEnv, cwd?: string): string;
/**
 * Installs the CLI globally when it is only running ephemerally (`npx @flisk-sh/flisk`),
 * so the `flisk` command keeps working after the run. The old package is removed first:
 * it owns the `flisk` command and would make the install fail with EEXIST.
 */
export declare function ensureGlobalInstall(env?: NodeJS.ProcessEnv): "installed" | "present" | "failed";
