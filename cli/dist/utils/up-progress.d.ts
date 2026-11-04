export type ServiceProgressState = "waiting" | "building" | "starting" | "ready" | "failed";
export interface ServiceProgress {
    name: string;
    state: ServiceProgressState;
    /** Milliseconds the service has been building, if in the building state. */
    buildingDurationMs?: number;
}
/**
 * The state of each resource `flisk up` waits for, from `tilt get uiresources -o json`. Disabled, deferred, advisory and
 * the `(Tiltfile)` resource are left out, so the count matches what readiness gates on.
 */
export declare function classifyUpProgress(jsonText: string, deferred: Set<string>): ServiceProgress[];
export declare function formatProgressDuration(ms: number): string;
/** `5/9 ready`, then the services in each unfinished state, including duration for building services. */
export declare function formatUpProgressLine(services: ServiceProgress[]): string;
export declare function formatServiceFailedLine(name: string): string;
/**
 * Redraw one line in place only on an interactive terminal. `--quiet`, a pipe, CI and `TERM=dumb` get plain lines with
 * no cursor control.
 */
export declare function shouldRedrawUpProgress(input: {
    isTTY: boolean | undefined;
    quiet: boolean;
    env: NodeJS.ProcessEnv;
}): boolean;
export interface UpProgressReporter {
    /** One look at Tilt's resource JSON. */
    update(jsonText: string): void;
    /** Clears the in-place line; later output starts on a clean line. */
    finish(): void;
}
/**
 * Shows per-service progress while `flisk up` waits for Tilt. Redraw mode keeps one line current and prints a failure as
 * a line of its own; plain mode prints one line per state change.
 */
export declare function createUpProgressReporter(options: {
    write: (text: string) => void;
    redraw: boolean;
    deferred: Set<string>;
    /** Terminal width; the redrawn line is cut to it so it never wraps. */
    columns?: number;
    now?: () => number;
}): UpProgressReporter;
/** Wraps the readiness poll so every answer from Tilt also updates the progress. */
export declare function fetchWithProgress(fetchJson: (port: number) => Promise<string | null>, progress: UpProgressReporter): (port: number) => Promise<string | null>;
