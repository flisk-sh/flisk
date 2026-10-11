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
