import type { CheckResult } from "../types/index.js";
export type DoctorActionStatus = "planned" | "applied" | "skipped" | "failed";
/** One repair `tdk doctor --fix` plans or performs. Part of the `--json` report (`data.actions`). */
export interface DoctorAction {
    id: string;
    check: string;
    /** `project`: owned by the current project. `probe`: a doctor probe, owned by no project. */
    scope: "project" | "probe";
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
}
type DockerRunner = (args: string[]) => Promise<string>;
export declare function createDockerFixDeps(run?: DockerRunner): DoctorFixDeps;
export declare const dockerFixDeps: DoctorFixDeps;
/**
 * What `--fix` would do. Only unused networks that are either a leftover doctor probe or one of this project's own
 * (the exact names the engine creates, and only while `projectBusy` is unset) are planned; another project's networks are never listed here.
 */
export declare function planDoctorFixes(projectName: string | undefined, deps?: DoctorFixDeps, projectBusy?: string): Promise<DoctorAction[]>;
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
/** Every distinct `tdk` on PATH (symlinks to one binary count once), in PATH order. */
export declare function findTdkInstalls(paths?: string[], readVersion?: (path: string) => Promise<string | null>): Promise<TdkInstall[]>;
/** Two `tdk` binaries can disagree (a dashboard or MCP client may launch the older one), so say which is which. */
export declare function checkDuplicateTdkInstalls(installs?: TdkInstall[]): Promise<CheckResult>;
/**
 * PIDs of `tilt up` processes for this project. The process list shows the Tiltfile path as it was typed at launch,
 * which may or may not be the symlink-resolved path, so both spellings are looked up.
 */
export declare function projectTiltPids(projectRoot: string, find?: (tiltfilePath: string) => number[]): number[];
export {};
