/**
 * Two `flisk up` runs in different projects both ask "is 10350 (or 8080, or 15432) free?", get yes, and both take it, because
 * nothing is bound until Tilt and Docker start seconds later. One project then fails to start. A claim is a short-lived file
 * per port, created exclusively, that closes the gap between the probe and the bind: the second run sees the claim and moves
 * to the next port. It only covers the start-up window. Once the port is really bound the probe itself says it is taken.
 */
/** Long enough for Tilt and Docker to bind after the probe, short enough that a crashed run never blocks a port for long. */
export declare const PORT_CLAIM_TTL_MS = 120000;
export interface PortClaimOptions {
    /** Where claim files live. Defaults to a folder in the OS temp directory, shared by every project on the machine. */
    dir?: string;
    now?: () => number;
    pid?: number;
    isProcessAlive?: (pid: number) => boolean;
    ttlMs?: number;
}
export declare function defaultClaimDir(): string;
/**
 * A claim function for one project. `claim(port)` is true when this project now holds the port: nobody else holds it, or the
 * holder is gone or expired, or the holder is this same project (a second `up` in one project is handled by the Tilt check).
 * It never throws: when the claim folder cannot be written, claiming is skipped and the old probe-only behaviour applies.
 */
export declare function createPortClaimer(owner: string, options?: PortClaimOptions): (port: number) => boolean;
