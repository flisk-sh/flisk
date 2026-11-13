export interface StackProgress {
    /** Resources that are up. */
    ready: number;
    /** Resources Tilt is still working on. */
    building: number;
    /** Resources that have not started yet. */
    pending: number;
    /** Resources that failed. */
    failed: number;
    /** The services the user sees: their own services plus the database and the proxy, not Tilt helpers. */
    total: number;
    /** The infrastructure step still running (base images, databases, networks), when one is. */
    infraPhase?: string;
    /** The resources that are still working, with their state. */
    working: {
        name: string;
        state: string;
    }[];
    /** The resources that failed, with the reason. */
    broken: {
        name: string;
        message: string;
    }[];
    /** How long the stack has been coming up, in seconds. */
    elapsed: number;
}
/** Runs `tilt get uiresources` and returns its JSON, or null when Tilt does not answer. */
export type TiltResourceReader = (port: number) => Promise<string | null>;
/** Reads the resource states from the Tilt UI API. */
export declare function readStackProgress(port: number, read?: TiltResourceReader): Promise<Omit<StackProgress, "elapsed"> | undefined>;
/** A one-line summary of the progress, for the progress line. */
export declare function formatProgress(progress: StackProgress): string;
