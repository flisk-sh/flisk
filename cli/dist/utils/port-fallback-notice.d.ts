import type { HostPortPlan } from "../types/index.js";
/** One line per port Flisk moved off the one it wanted. Ports the user set explicitly are never listed. */
export declare function formatPortFallbackNotice(plan: HostPortPlan): string[];
