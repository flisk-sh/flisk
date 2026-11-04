/**
 * `flisk os`: starts FliskOS, the local desktop app for Flisk projects, coding agents and Flisk apps.
 *
 * FliskOS lives in its own repository and ships on its own, so this command only finds it and starts it: the
 * `fliskos` command when it is on PATH, otherwise FliskOS.app on macOS. It never installs anything; when neither
 * exists it says how to install it. `flisk ui` is the separate terminal dashboard and is not touched.
 */
import { type ChildProcess, type SpawnOptions } from "node:child_process";
import { Command } from "commander";
import { JsonCommandError } from "../utils/json-command.js";
/** The command the FliskOS package installs. */
export declare const FLISKOS_COMMAND = "fliskos";
/** The npm package that installs it (not published yet). */
export declare const FLISKOS_PACKAGE = "@flisk-sh/fliskos";
/** The repository FliskOS is built from. */
export declare const FLISKOS_REPOSITORY = "https://github.com/flisk-sh/fliskos";
/** The name of the macOS app, which is what `open -a` takes. */
export declare const FLISKOS_APP = "FliskOS";
/** How long `--json` waits for FliskOS to say where it listens before it gives up. */
export declare const READY_TIMEOUT_MS = 30000;
type SpawnFn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;
/** What `flisk os` needs to know about the machine, so a test can describe one without having it. */
export interface FliskOsHost {
    platform: NodeJS.Platform;
    home: string;
    findCommand: (name: string) => string | null;
    exists: (path: string) => boolean;
}
/** Everything `launchFliskOs` reaches outside the process through. */
export interface OsDeps {
    host: FliskOsHost;
    spawn: SpawnFn;
    cwd: string;
    readyTimeoutMs: number;
}
/** The options of `flisk os` as Commander hands them over. */
export interface OsOptions {
    project?: string;
    /** Kept as typed, so a bad value is reported with the text the user wrote. */
    port?: string;
    /** False when `--no-open` was given. */
    open?: boolean;
    scanRoot?: string[];
    json?: boolean;
}
/** Where FliskOS was found: the `fliskos` executable, or the macOS app bundle. */
export interface FliskOsLocation {
    via: "command" | "app";
    path: string;
}
/** What `flisk os --json` reports. */
export interface OsReport {
    /** How FliskOS was started. */
    via: "command" | "app";
    /** The `fliskos` executable, or the app bundle. */
    path: string;
    /** The arguments it was started with (`open`'s, for the app). */
    args: string[];
    /** The Flisk project FliskOS was pointed at, or null when none was passed. */
    project: string | null;
    /**
     * Where FliskOS listens, once the command reported it, exactly as printed. The URL carries FliskOS's access token in
     * its query string, so it is a credential: keep it out of logs. Null for the app, which opens its own window.
     */
    url: string | null;
    /** The options that were given but the app cannot take. Empty for the command. */
    ignored: string[];
}
/** A started FliskOS: what to report, and the exit code once it is done. */
export interface OsLaunch {
    report: OsReport;
    finished: Promise<number>;
}
export declare function defaultHost(): FliskOsHost;
/** The places `install:mac` puts the app: the system folder when it was writable, else the user's. */
export declare function appBundles(host: Pick<FliskOsHost, "home">): string[];
/**
 * Finds FliskOS: the `fliskos` command wins, because it takes the project and the other options; the macOS app is the
 * fallback. Returns null when neither is there.
 */
export declare function locateFliskOs(host?: FliskOsHost): FliskOsLocation | null;
/** The error for a machine with neither the command nor the app. Nothing is installed on the user's behalf. */
export declare function notInstalledError(platform?: NodeJS.Platform): JsonCommandError;
/** Reads `--port` the way `fliskos` does: an integer from 0 (a free port) to 65535. */
export declare function parsePort(value: string): number;
/**
 * The project to open: the one at `--project` (an error when it is not a Flisk project), else the one around the
 * current folder, else none, and FliskOS finds the projects itself.
 */
export declare function resolveOsProject(explicit: string | undefined, cwd: string): string | null;
/** The arguments `fliskos` takes, in the order they are documented. */
export declare function fliskOsArgs(input: {
    project: string | null;
    port?: number;
    open?: boolean;
    scanRoots?: string[];
}): string[];
/**
 * Finds FliskOS and starts it. The command runs in the foreground with the caller's terminal, and `finished` resolves
 * with its exit code. With `--json` the command's output is piped so the URL can be read from it: this resolves once
 * FliskOS listens (so the envelope can go out), and `finished` still resolves when it stops. The app opens and returns.
 */
export declare function launchFliskOs(options: OsOptions, overrides?: Partial<OsDeps>): Promise<OsLaunch>;
/**
 * Runs `flisk os`: starts FliskOS and waits for it, setting the exit code to its own. With `--json` one envelope goes
 * to stdout as soon as FliskOS is up, and the command keeps running until FliskOS stops.
 */
export declare function runOs(options: OsOptions, overrides?: Partial<OsDeps>): Promise<void>;
export declare const osCommand: Command;
export {};
