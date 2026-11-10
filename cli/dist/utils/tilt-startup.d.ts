export type TiltPortParseResult = {
    ok: true;
    port: number | undefined;
} | {
    ok: false;
    message: string;
};
export declare function parseTiltPort(value: string | undefined): TiltPortParseResult;
/** Resolve the port for read-only polling, falling back when TILT_PORT is absent or invalid. */
export declare function getTiltPollingPort(value: string | undefined): number;
export declare function secondUpAction(input: {
    runningPorts: number[];
    force: boolean;
    only: boolean;
}): {
    action: "start";
} | {
    action: "already-running" | "only-blocked";
    ports: number[];
};
/**
 * What a second `flisk up` says about the Tilt it found running. A failed `flisk up` leaves its Tilt running, so
 * "a Tilt answers on the port" is not "the stack is healthy": report what that Tilt is running.
 */
export declare function alreadyRunningReport(port: number, readiness: {
    ready: boolean;
    failures: Array<{
        name: string;
        message: string;
    }>;
    timedOut: boolean;
    stillBuilding?: string[];
}): {
    ok: true;
    message: string;
} | {
    ok: false;
    code: "UP_RESOURCE_FAILED" | "UP_TIMEOUT";
    message: string;
    suggestions: string[];
};
export declare function resolveTiltPort(options: {
    configuredPort: number | undefined;
    force: boolean;
    basePort: number;
    findAvailablePort: (basePort: number, attempts: number) => Promise<number | null | undefined>;
}): Promise<{
    port: number;
    autoSwitched: boolean;
}>;
export declare function stopTiltForUp(options: {
    force: boolean;
    quiet: boolean;
    port: number;
}, dependencies: {
    stop: (port: number) => void;
    log: (message: string) => void;
    wait: (milliseconds: number) => Promise<void>;
}): Promise<void>;
