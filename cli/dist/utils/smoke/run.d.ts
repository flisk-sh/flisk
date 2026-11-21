import type { SmokeDeps, SmokePlan, SmokeResult } from "./schema.js";
/** Runs the steps in order. A not-ready answer (connection error, 404, 502-504) is retried until the timeout; a real wrong answer fails at once. */
export declare function runSmokePlan(plan: SmokePlan, deps?: SmokeDeps): Promise<SmokeResult>;
/**
 * The dependencies that keep smoke text safe: the project's own secret values are masked before anything is shown or stored.
 * Both `flisk up` and `flisk doctor` use them, so neither prints a body that holds a secret.
 */
export declare function safeSmokeDeps(projectRoot: string, warn?: (message: string) => void, options?: {
    envFiles?: readonly string[];
}): Pick<SmokeDeps, "redact" | "warn">;
/** Runs every plan side by side; each plan keeps its own timeout. */
export declare function runSmokePlans(plans: SmokePlan[], deps?: SmokeDeps): Promise<SmokeResult[]>;
