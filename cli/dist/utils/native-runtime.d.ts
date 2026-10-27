import type { DiscoveredResource } from "../types/index.js";
/**
 * The native runtime (#2229): `flisk up` starts every selected `command` service as a local process and supervises it, with no
 * Docker and no Tilt. It runs in the foreground like `tilt up` does: Ctrl+C (or `flisk down` from another terminal) stops it.
 *
 * - Services start in `dependsOn` order: a service starts once everything it depends on is ready.
 * - Ready means the health URL answers (`healthCheckPath` on `port`), else the port accepts connections, else the process is
 *   still alive after a second.
 * - Output is prefixed with the service name and also appended to `.flisk/native/logs/<service>.log`.
 * - A process that exits is restarted with a growing delay, unless the service sets `"restart": "no"`. Five quick crashes in a
 *   row stop the restarts.
 * - `.flisk/native/run.json` records the supervisor and service process ids so `flisk down` can stop a run it did not start.
 */
/** Everything the supervisor needs to start one service. */
export interface NativeServicePlan {
    name: string;
    command: string;
    /** The service directory: the command runs from where its service.json is. */
    cwd: string;
    port?: number;
    /** The service's own environment (`env` from service.json, expanded) plus PORT. The process also inherits the shell's. */
    env: Record<string, string>;
    dependsOn: string[];
    /** Polled until it answers below 400 before dependents start. */
    healthUrl?: string;
    /** What `flisk up` prints for the service. */
    url?: string;
    restart: boolean;
}
/** The directory, under the project's .flisk/, that holds the run state and log files. */
export declare const NATIVE_DIR: string;
/** `http://localhost:<port>` for display and health checks. Built here so callers never hold a URL literal. */
export declare function localUrl(port: number, path?: string): string;
/**
 * Expands `${VAR}` and `${VAR:-default}` from `vars`. An unknown variable without a default becomes an empty string, the way a
 * shell expands it, and is reported through `onMissing` so `flisk up` can say which one.
 */
export declare function expandEnvValue(value: string, vars: Readonly<Record<string, string | undefined>>, onMissing?: (name: string) => void): string;
/**
 * Start order as waves: every service in a wave depends only on services in earlier waves. Names in `dependsOn` that are not
 * part of the selection are ignored here (planNativeRun reports them). Throws on a cycle; the service config gate refuses
 * cycles first, so this is a safety net.
 */
export declare function dependencyWaves(services: ReadonlyArray<{
    name: string;
    dependsOn: readonly string[];
}>): string[][];
export interface NativeRunPlan {
    services: NativeServicePlan[];
    /** Problems that stop the run before anything starts, each naming the service. */
    errors: string[];
    /** `${VAR}` references that expanded to nothing, as "service: VAR". */
    missingVars: string[];
}
/**
 * Turns the selected `command` services into start plans and reports what would stop the run: a dependsOn that is not a service
 * of the selection (a database or the gateway needs Docker for now), and two services on one port.
 */
export declare function planNativeRun(selected: readonly DiscoveredResource[], vars?: Readonly<Record<string, string | undefined>>): NativeRunPlan;
/** Services whose command starts a program that is not on PATH (a relative path such as ./bin/api is checked in the service directory). */
export declare function findMissingPrograms(plans: readonly NativeServicePlan[], find?: (program: string) => string | null, exists?: (path: string) => boolean): Array<{
    name: string;
    program: string;
}>;
/** True when something accepts TCP connections on localhost:port. */
export declare function isPortListening(port: number, timeoutMs?: number): Promise<boolean>;
/** Polls a plan's readiness signal until it passes, `isAlive` turns false, or the timeout passes. */
export declare function waitForServiceReady(plan: Pick<NativeServicePlan, "healthUrl" | "port">, options: {
    isAlive: () => boolean;
    timeoutMs?: number;
    intervalMs?: number;
}): Promise<boolean>;
/** What `.flisk/native/run.json` holds while a native run is up. */
export interface NativeRunState {
    /** The `flisk up` process supervising the services. */
    pid: number;
    startedAt: string;
    services: Record<string, {
        pid?: number;
        port?: number;
        url?: string;
        ready?: boolean;
    }>;
}
export declare function nativeRunStatePath(projectRoot: string): string;
export declare function nativeLogPath(projectRoot: string, service: string): string;
export declare function readNativeRunState(projectRoot: string): NativeRunState | null;
/** True while the process exists (a zombie or another user's process counts as existing). */
export declare function isProcessAlive(pid: number): boolean;
/**
 * Stops the native run recorded for this project: asks the supervising `flisk up` to stop its services, then stops any service
 * process still alive (a supervisor killed with SIGKILL cannot stop them itself). Returns the services that were stopped.
 */
export declare function stopNativeRun(projectRoot: string, options?: {
    timeoutMs?: number;
}): Promise<{
    wasRunning: boolean;
    services: string[];
    supervisorPid?: number;
}>;
/**
 * Each service's state from the run on record, in the shape `flisk status` reports Tilt's: ready once it passed its readiness
 * check, pending while it starts or the supervisor restarts it, unknown when nothing runs.
 */
export declare function nativeServiceStates(projectRoot: string, services: readonly string[]): Record<string, {
    status: "ready" | "pending" | "unknown";
    reason?: string;
}>;
/** One line of a local process's output, as `flisk logs` reports it (the shape of a Tilt log line). */
export interface NativeLogLine {
    time: string | null;
    resource: string;
    level: null;
    source: null;
    text: string;
}
/**
 * The last `tail` lines the given services wrote, oldest first, merged across services by time. `sinceMs` drops lines older
 * than that many milliseconds. A service that wrote nothing yet has no log file and contributes no lines.
 */
export declare function readNativeLogLines(projectRoot: string, services: readonly string[], options: {
    tail: number;
    sinceMs?: number;
    now?: number;
}): NativeLogLine[];
/** Reports from the supervisor, so `flisk up` decides what reaches the terminal. */
export interface SupervisorEvents {
    /** One line of service output (no trailing newline). */
    onLine?: (service: string, line: string, stream: "stdout" | "stderr") => void;
    /** A lifecycle note: started, ready, exited, restarting, gave up. */
    onNote?: (service: string, message: string) => void;
}
/** Starts and supervises the planned services. One instance per `flisk up`. */
/**
 * How a service.json `command` line is run: the platform shell, invoked the way Node's `shell: true` does it (`/bin/sh -c`,
 * or `%ComSpec% /d /s /c "<line>"` on Windows), spelled out so the call does not hand an opaque flag to spawn.
 */
export declare function shellInvocation(command: string, platform?: NodeJS.Platform, comSpec?: string | undefined): {
    file: string;
    args: string[];
    windowsVerbatimArguments: boolean;
};
export declare class NativeSupervisor {
    private readonly projectRoot;
    private readonly events;
    private readonly options;
    private readonly services;
    private readonly startedAt;
    private stopping;
    constructor(projectRoot: string, plans: readonly NativeServicePlan[], events?: SupervisorEvents, options?: {
        readyTimeoutMs?: number;
        restartDelayMs?: number;
        /** The environment every service starts with, before its own `env`. Defaults to the shell's. */
        baseEnv?: Readonly<Record<string, string | undefined>>;
    });
    /** The width service names are padded to in prefixed output. */
    get prefixWidth(): number;
    /**
     * Starts every service once its dependencies are ready. Resolves with the services that never became ready (empty when the
     * whole selection is up); a service whose dependency failed is reported as blocked and never started.
     */
    start(): Promise<Array<{
        name: string;
        reason: string;
    }>>;
    /** Stops every service, dependents before what they depend on, and removes the run state. */
    stop(): Promise<void>;
    /** The current process id of a service, for tests and diagnostics. */
    pidOf(name: string): number | undefined;
    private spawn;
    private onExit;
    private pipeLines;
    private saveState;
}
/** `name | ` in the service's color, padded so the output of several services lines up. */
export declare function formatPrefix(name: string, index: number, width: number): string;
