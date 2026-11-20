import { type RunningStack } from "../utils/down-all.js";
export interface DownAllOptions {
    all?: boolean;
    yes?: boolean;
    force?: boolean;
    dryRun?: boolean;
    json?: boolean;
    verbose?: boolean;
}
/** A stack as it appears in the JSON report: no pids or internal stop details. */
export declare function stackReport(stack: RunningStack): {
    folder: string;
    runtime: import("../utils/down-all.js").StackRuntime;
    services: string[];
    ports: number[];
    stacks: string[];
    missingFolder: boolean;
};
/** One line of the human inventory: folder, runtime, services and the ports they publish. */
export declare function formatStack(stack: RunningStack): string;
/**
 * `flisk down --all`: one inventory, one confirmation, then one stop per stack. The stop path never runs `tilt down`, so a
 * project's generated Tiltfile and Compose files are not rewritten as a side effect of stopping it.
 */
export declare function runDownAll(options: DownAllOptions): Promise<void>;
