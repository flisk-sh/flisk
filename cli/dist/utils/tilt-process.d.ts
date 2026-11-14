type CommandRunner = (command: string, args: string[]) => string;
/** Refuse to target arbitrary listeners: only stop a Tilt process on the requested UI port. */
export declare function findTiltProcessIdsOnPort(port: number, platform?: NodeJS.Platform, commandRunner?: CommandRunner): number[];
export declare function stopTiltProcessIds(pids: number[], platform?: NodeJS.Platform, commandRunner?: CommandRunner): number[];
export declare function stopTiltOnPort(port: number, platform?: NodeJS.Platform, commandRunner?: CommandRunner): number[];
export {};
