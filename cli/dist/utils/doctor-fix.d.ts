import type { CheckResult } from "../types/index.js";
export type DoctorActionStatus = "planned" | "applied" | "skipped" | "failed";
/** One repair `flisk doctor --fix` plans or performs. Part of the `--json` report (`data.actions`). */
export interface DoctorAction {
    id: string;
    check: string;
    /**
     * `project`: owned by the current project. `probe`: a doctor probe, owned by no project. `machine`: another
     * Flisk project's resource, only ever planned with `--scope=machine`. `host`: a cache shared by every project
     * (Docker build cache, dangling images), only planned while free disk space is low.
     */
    scope: "project" | "probe" | "machine" | "host";
    /** The exact command a user could run by hand. */
    command: string;
    status: DoctorActionStatus;
    reason: string;
}
export interface DockerNetwork {
    name: string;
    /** Containers attached; a network with any is in use and is never planned for removal. */
    containers: number;
}
/** The Docker calls the fixes need, injectable so tests need no daemon. */
export interface DoctorFixDeps {
    listNetworks(): Promise<DockerNetwork[]>;
    removeNetwork(name: string): Promise<void>;
    isProcessAlive(pid: number): boolean;
    /** Whether a Tilt process serves its UI: `stale` only when it has run a while and nothing it listens on answers. */
    tiltStatus(pid: number): Promise<"healthy" | "stale" | "unknown">;
    stopProcess(pid: number): void;
    /** Free GiB on the disk Docker data lives on (the home directory's), or null when unreadable. */
    freeDiskGib(): number | null;
    /** What `docker builder prune` and `docker image prune` (dangling only) would reclaim. */
    reclaimable(): Promise<{
        buildCache: string | null;
        danglingImages: number;
    }>;
    prune(kind: "builder" | "images"): Promise<void>;
}
type DockerRunner = (args: string[]) => Promise<string>;
/** `ps -o etime=` ("[[dd-]hh:]mm:ss") in seconds. */
export declare function parseElapsed(etime: string): number | null;
/**
 * Whether any of `ports` answers as a Tilt UI. A busy Tilt can miss one request, and a wrong "stale" ends in a kill,
 * so a port gets a second try before it counts as silent.
 */
export declare function anyTiltAnswers(ports: number[], probe?: (port: number) => Promise<string | null>, attempts?: number, wait?: (ms: number) => Promise<void>): Promise<boolean>;
export declare function createDockerFixDeps(run?: DockerRunner): DoctorFixDeps;
export declare const dockerFixDeps: DoctorFixDeps;
export interface PlanContext {
    /** `tilt up` processes for this project (see `projectTiltPids`). */
    tiltPids?: number[];
    /** `--scope=machine`: also plan unused networks of other Flisk projects. */
    machine?: boolean;
}
/**
 * What `--fix` would do: stop this project's stale Tilt; remove unused networks that are a leftover doctor probe or
 * this project's own (the exact names the engine creates, skipped while its Tilt runs). Other Flisk projects' unused
 * networks are planned only with `context.machine`, each naming its owner.
 */
export declare function planDoctorFixes(projectName: string | undefined, deps?: DoctorFixDeps, context?: PlanContext): Promise<DoctorAction[]>;
export interface ApplyOptions {
    dryRun: boolean;
    /** Ask before each destructive action; resolves false to decline. Absent means confirmation is unavailable. */
    confirm?: (action: DoctorAction) => Promise<boolean>;
}
/** Run the planned actions in order. A declined or failed action never stops the rest, so a re-run converges. */
export declare function applyDoctorFixes(actions: DoctorAction[], options: ApplyOptions, deps?: DoctorFixDeps): Promise<DoctorAction[]>;
/** Whether any action leaves a problem behind that a re-run could still repair. */
export declare function hasFailedActions(actions: DoctorAction[]): boolean;
export interface TdkInstall {
    path: string;
    version: string | null;
}
/** Every distinct Flisk install on PATH (symlinks to one binary count once), in PATH order. */
export declare function findTdkInstalls(paths?: string[], readVersion?: (path: string) => Promise<string | null>): Promise<TdkInstall[]>;
/** Two `flisk` binaries can disagree (a dashboard or MCP client may launch the older one), so say which is which. */
export declare function checkDuplicateTdkInstalls(installs?: TdkInstall[]): Promise<CheckResult>;
/**
 * PIDs of `tilt up` processes for this project. The process list shows the Tiltfile path as it was typed at launch,
 * which may or may not be the symlink-resolved path, so both spellings are looked up.
 */
export declare function projectTiltPids(projectRoot: string, find?: (tiltfilePath: string) => number[]): number[];
export {};
