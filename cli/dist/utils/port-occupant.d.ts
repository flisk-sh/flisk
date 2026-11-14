import type { PortOccupant } from "../types/index.js";
type CommandRunner = (command: string, args: string[]) => string;
/**
 * The process listening on `port`, or null when it cannot be told (no lsof, Windows, nothing listens, or the process
 * exited before ps could read it). Callers must treat null as "unknown", not as "free".
 */
export declare function findPortOccupant(port: number, platform?: NodeJS.Platform, commandRunner?: CommandRunner): PortOccupant | null;
/**
 * The Docker container that publishes `port` on the host, or null when none does or Docker cannot be read. A published
 * port shows up in `lsof` as Docker's own helper (`ssh`, `com.docker.backend`, `limactl`), which names no one; the
 * container is the answer the user can act on (#4124).
 */
export declare function findPortContainer(port: number, commandRunner?: CommandRunner): PortOccupant | null;
export {};
