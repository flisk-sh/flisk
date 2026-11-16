/**
 * `flisk resource` picks a port from the resources it found when it started and writes service.json later. Several creates
 * at once (shell `&`, or agents calling the `resource_create` MCP tool together) all start from the same scan, so they
 * picked the same port and all exited 0 (#4023). A create now claims its port in a per-project claim folder and then reads
 * the ports in service.json again: a port
 * that another create holds or has written in the meantime is skipped, or refused when --port asked for it.
 */
/** One claim folder per project, outside the project so nothing has to be ignored in git. */
export declare function resourcePortClaimDir(projectRoot: string): string;
/** The ports every service.json in the project has on disk now, except the one at `ignorePath`. */
export declare function readAssignedPorts(projectRoot: string, ignorePath?: string): Set<number>;
export interface ResourcePortReservation {
    claim: (port: number) => boolean;
    release: (port: number) => void;
    assignedPorts: () => Set<number>;
}
export interface ResourcePortReservationOptions {
    /** Unique per create: two creates in one process (the MCP server) must not share a claim. */
    owner?: string;
    dir?: string;
    /** The service.json of the resource being registered, which already has its own port. */
    ignorePath?: string;
    isProcessAlive?: (pid: number) => boolean;
}
export declare function resourcePortReservation(projectRoot: string, options?: ResourcePortReservationOptions): ResourcePortReservation;
export interface ReserveOptions {
    /** The port came from --port: it is kept or refused, never moved. */
    explicit: boolean;
    /** The last port of the type's range. */
    max: number;
    /** An extra test a moved-to port has to pass, e.g. nothing listens on it for --local. */
    isFree?: (port: number) => Promise<boolean>;
    /** How the refusal names the port ("Port", or "BYO port" for bring-your-own). */
    subject?: string;
}
export interface ReservedPort {
    port: number;
    /** Frees the claim once service.json is written (or the create gave up). */
    release: () => void;
}
/**
 * Claims `port`, or the next port up to `max` that no other create holds and no service.json has. The claim comes first
 * and the service.json read second, so a create that wrote between this one's scan and its claim is still seen.
 */
export declare function reserveResourcePort(port: number, options: ReserveOptions, reservation: ResourcePortReservation): Promise<ReservedPort>;
