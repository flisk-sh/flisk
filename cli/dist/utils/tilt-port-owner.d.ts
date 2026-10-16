type CommandRunner = (command: string, args: string[]) => string;
export interface TiltPortOwner {
    pid: number;
    /** The project root of the Tiltfile (`tilt up -f <root>/.tdk/.tdk-out/Tiltfile`). */
    root: string;
}
/**
 * The project whose `tilt up` listens on `port`, or null when it cannot be told (no lsof, Windows, a Tilt started
 * without `-f`, a listener that is not Tilt). Callers must treat null as "unknown", not as "not mine".
 */
export declare function findTiltPortOwner(port: number, platform?: NodeJS.Platform, commandRunner?: CommandRunner): TiltPortOwner | null;
/** Whether `owner` is another project's Tilt, as opposed to this project's or unknown. */
export declare function isForeignTilt(owner: TiltPortOwner | null, projectRoot: string): boolean;
export {};
