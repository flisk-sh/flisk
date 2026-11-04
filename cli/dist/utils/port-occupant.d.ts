import type { PortOccupant } from "../types/index.js";
type CommandRunner = (command: string, args: string[]) => string;
/**
 * The process listening on `port`, or null when it cannot be told (no lsof, Windows, nothing listens, or the process
 * exited before ps could read it). Callers must treat null as "unknown", not as "free".
 */
export declare function findPortOccupant(port: number, platform?: NodeJS.Platform, commandRunner?: CommandRunner): PortOccupant | null;
export {};
