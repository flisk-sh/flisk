import type { PortOccupant } from "./port-occupant.js";
/** The host port a conflict message is about, or null when the message is not a port conflict. */
export declare function conflictPort(message: string): number | null;
/**
 * The next step for a host port another process already holds. When the occupant is known it is named; otherwise the
 * command that finds it is given instead.
 */
export declare function portConflictFix(message: string, occupant?: PortOccupant | null): string | null;
