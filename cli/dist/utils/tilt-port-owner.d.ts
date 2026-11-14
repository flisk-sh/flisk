type CommandRunner = (command: string, args: string[]) => string;
export interface TiltPortOwner {
    pid: number;
    /** The project root of the Tiltfile (`tilt up -f <root>/.flisk/.flisk-out/Tiltfile`). */
    root: string;
}
/**
 * The project whose `tilt up` listens on `port`, or null when it cannot be told (no lsof, Windows, a Tilt started
 * without `-f`, a listener that is not Tilt). Callers must treat null as "unknown", not as "not mine".
 */
export declare function findTiltPortOwner(port: number, platform?: NodeJS.Platform, commandRunner?: CommandRunner): TiltPortOwner | null;
/** Whether `owner` is confirmed to belong to this project's Tiltfile. */
export declare function isOwnTilt(owner: TiltPortOwner | null, projectRoot: string): boolean;
/** Whether `owner` is another project's Tilt, as opposed to this project's or unknown. */
export declare function isForeignTilt(owner: TiltPortOwner | null, projectRoot: string): boolean;
export interface ClassifiedTiltPorts {
    /** Ports whose Tilt is this project's, or whose owner cannot be told (treated as before: this environment). */
    running: number[];
    /** Ports held by another project's Tilt. */
    foreign: {
        port: number;
        root: string;
    }[];
}
/** Split the candidate Tilt UI ports that answer into this project's and other projects'. */
export declare function classifyTiltPorts(candidatePorts: number[], projectRoot: string, isServing: (port: number) => Promise<boolean>, ownerOf?: (port: number) => TiltPortOwner | null): Promise<ClassifiedTiltPorts>;
export interface ProjectTiltPorts extends ClassifiedTiltPorts {
    /**
     * Ports in `running` that only the saved port found and whose Tilt is confirmed to belong to this project.
     * Unknown-owner listeners on a stale saved port are excluded so `--force` never stops an unconfirmed process.
     */
    savedRunning: number[];
    /**
     * The saved port serves a Tilt whose owner could not be identified (Windows, or no lsof/ps). It is not counted as this
     * project's in `running`, and `--force` must refuse rather than start a second Tilt beside it.
     */
    unknownSaved: number[];
}
/**
 * The Tilt UI ports `flisk up` treats as this project's running Tilt. The watched ports are classified as before. The port
 * the last `flisk up` saved is checked too: a project whose first run moved off 10350 (another project's Tilt held it) keeps
 * its Tilt on that port, and a second run that looked at 10350 alone started another Tilt for the same Tiltfile on the next
 * free port (#4165). The saved port only adds to `running`. Another project's Tilt on it is not reported in `foreign`,
 * because this run never asked for that port. Only confirmed project-owned saved ports enter `savedRunning` for `--force`.
 */
export declare function findProjectTiltPorts(options: {
    watchedPorts: number[];
    savedPort: number | null;
    projectRoot: string;
    isServing: (port: number) => Promise<boolean>;
    ownerOf?: (port: number) => TiltPortOwner | null;
}): Promise<ProjectTiltPorts>;
/**
 * Stop a Tilt on `port` only after re-verifying that the current listener is a `tilt` process owned by `projectRoot`
 * (and matching `expectedOwner.pid` when provided). Prevents `--force` from killing an unrelated or unknown-owner Tilt
 * that reused a stale saved port.
 */
export declare function stopOwnedTiltOnPort(port: number, projectRoot: string, expectedOwner?: TiltPortOwner, platform?: NodeJS.Platform, commandRunner?: CommandRunner): number[];
export {};
