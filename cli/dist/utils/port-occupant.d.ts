type CommandRunner = (command: string, args: string[]) => string;
export interface PortOccupant {
    pid: number;
    /** The program's name, without its directory (`postgres`, not `/opt/homebrew/bin/postgres`). */
    command: string;
}
/**
 * The process listening on `port`, or null when it cannot be told (no lsof, Windows, nothing listens, or the process
 * exited before ps could read it). Callers must treat null as "unknown", not as "free".
 */
export declare function findPortOccupant(port: number, platform?: NodeJS.Platform, commandRunner?: CommandRunner): PortOccupant | null;
export {};
