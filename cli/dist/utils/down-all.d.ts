import { type CommandRunner, type ComposeFallbackResult } from "./down-cleanup.js";
import { type NativeRunState, type NativeStopResult } from "./native-runtime.js";
import { type ProjectRecord } from "./project-registry.js";
/** `local` is the native `command`-service runtime; `docker` is the Tilt/Compose runtime. */
export type StackRuntime = "local" | "docker";
/** One running Flisk stack, with everything `down --all` needs to list and stop it. */
export interface RunningStack {
    /** Absolute folder of the project, which may no longer exist on disk. */
    folder: string;
    runtime: StackRuntime;
    services: string[];
    ports: number[];
    /** Stack names from `tilt up -- --focus=...`, when visible in its command line. */
    stacks: string[];
    /** True when the folder (its `.flisk/project.json`) is gone: the stack is still listed and stopped, never recreated. */
    missingFolder: boolean;
    tiltfile?: string;
    tiltPids: number[];
    composeProjects: string[];
    supervisorPid?: number;
}
/** Options for {@link discoverRunningStacks}; every external read is replaceable so tests never touch a real machine. */
export interface DownDiscoveryOptions {
    platform?: NodeJS.Platform;
    commandRunner?: CommandRunner;
    docker?: CommandRunner;
    cwdOf?: (pid: number) => string | undefined;
    readNative?: (root: string) => NativeRunState | null;
    nativeAlive?: (state: NativeRunState) => Promise<boolean>;
    folderExists?: (path: string) => boolean;
    records?: ProjectRecord[];
}
/** The process's working folder, which is where `flisk up` wrote this native run's state. */
export declare function processWorkingFolder(pid: number, platform?: NodeJS.Platform, commandRunner?: CommandRunner): string | undefined;
/** True for the `flisk up` supervisor, whether it was launched through a bin, node, bun or deno. */
export declare function isFliskUpCommand(command: string): boolean;
/**
 * Every running Flisk stack on this machine, from the one `ps` reader in down-cleanup, each native run's own state and
 * the running containers' Compose labels. Nothing is stopped, written or generated here.
 */
export declare function discoverRunningStacks(options?: DownDiscoveryOptions): Promise<RunningStack[]>;
/** What stopping one stack actually did, for the human summary and the JSON report. */
export interface StackStopResult {
    ok: boolean;
    stopped: string[];
    error?: string;
    stale?: boolean;
    unverified?: NativeStopResult["unverified"];
}
/** Options for {@link stopRunningStack}; the stop calls are replaceable so no test signals a real process. */
export interface StackStopOptions {
    platform?: NodeJS.Platform;
    commandRunner?: CommandRunner;
    stopTilt?: (tiltfile: string, platform: NodeJS.Platform, runner: CommandRunner) => number[];
    waitForTilt?: (tiltfile: string) => Promise<boolean>;
    stopCompose?: (root: string, runner: CommandRunner) => ComposeFallbackResult;
    stopNative?: (root: string) => Promise<NativeStopResult>;
}
/**
 * Stops one stack without loading its generated Tiltfile: kill only this Tilt's `tilt up`, then bring down only the Compose
 * projects whose containers carry this project's generated working folder. No generated file is read or rewritten.
 */
export declare function stopRunningStack(stack: RunningStack, options?: StackStopOptions): Promise<StackStopResult>;
