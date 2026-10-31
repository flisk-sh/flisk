import type { DoctorAction } from "../types/index.js";
/** Docker and doctor calls behind {@link ensureNetworkCapacity}, injectable so the logic is testable without Docker. */
export interface NetworkCapacityDeps {
    /** Tries to create and remove a throwaway network; returns Docker's message when it refuses. */
    probe(): string | null;
    /** The unused networks of every Flisk project (what `flisk doctor --fix --scope=machine` would remove). */
    planUnused(): Promise<DoctorAction[]>;
    apply(actions: DoctorAction[]): Promise<DoctorAction[]>;
}
export interface NetworkCapacityResult {
    /** True when Docker can create a network (before or after the cleanup). */
    ok: boolean;
    /** The networks the cleanup removed. */
    removed: string[];
    /** Docker's message when it still refuses after the cleanup. */
    error?: string;
}
/**
 * Makes sure Docker can create the demo's networks before the stack starts.
 *
 * Every Flisk project creates several networks and `flisk down` keeps them, so after a few projects Docker runs out of
 * address pools. Tilt then fails `init-networks` within a second, but nothing else can start, and the demo sat on
 * "Starting services" for minutes. Unused networks (no container attached) are safe to remove: `flisk up` recreates
 * them. Any other probe failure is left to the stack, which reports it.
 */
export declare function ensureNetworkCapacity(deps?: NetworkCapacityDeps): Promise<NetworkCapacityResult>;
