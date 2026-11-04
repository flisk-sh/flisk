import type { CheckResult, DoctorAction } from "../types/index.js";
import { type ColimaStatus } from "./colima.js";
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
    /**
     * Gives the space Docker freed inside the Colima VM back to the host. Pruning only frees space inside the VM; its disk
     * image keeps its size on the Mac until the free blocks are trimmed (`fstrim`).
     */
    trimColima(): Promise<void>;
    /** Starts, restarts, or repairs (native lima) the Colima VM, with a native limactl first on PATH when there is one. */
    colima(action: "start" | "restart" | "native-lima"): Promise<void>;
    /** The state of the Colima VM behind Docker. */
    colimaStatus(): ColimaStatus;
    /** Whether the Docker daemon answers right now. */
    dockerAnswers(): boolean;
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
export type ColimaRunner = (file: string, args: string[], options: {
    encoding: "utf-8";
    timeout: number;
    env?: NodeJS.ProcessEnv;
}) => Promise<unknown>;
/** Starts or restarts Colima, with a native limactl first on PATH when one is installed. */
export declare function runColima(action: "start" | "restart" | "native-lima", run?: ColimaRunner, findNativeLima?: () => string | undefined | null, hasFile?: (path: string) => boolean): Promise<void>;
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
export interface FliskInstall {
    path: string;
    version: string | null;
}
/** Every distinct `flisk` on PATH (symlinks to one binary count once), in PATH order. */
export declare function findFliskInstalls(paths?: string[], readVersion?: (path: string) => Promise<string | null>): Promise<FliskInstall[]>;
/** Two `flisk` binaries can disagree (a dashboard or MCP client may launch the older one), so say which is which. */
export declare function checkDuplicateFliskInstalls(installs?: FliskInstall[]): Promise<CheckResult>;
/**
 * PIDs of `tilt up` processes for this project. The process list shows the Tiltfile path as it was typed at launch,
 * which may or may not be the symlink-resolved path, so both spellings are looked up.
 */
export declare function projectTiltPids(projectRoot: string, find?: (tiltfilePath: string) => number[]): number[];
export {};
