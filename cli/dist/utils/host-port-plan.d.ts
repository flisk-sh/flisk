import type { HostPortPlan } from "../types/index.js";
export interface HostPortPlanOptions {
    env?: NodeJS.ProcessEnv;
    isAvailable?: (port: number) => Promise<boolean>;
    ranges?: Partial<Record<keyof HostPortPlan["explicit"], {
        start: number;
        end: number;
    }>>;
    database?: boolean;
    /** False when the gateway capability is off: no Traefik, so HTTP and HTTPS are neither planned nor probed. */
    gateway?: boolean;
    capabilities?: {
        database?: boolean;
        gateway?: boolean;
        [key: string]: boolean | undefined;
    };
}
/** The `reason` a plan gives for the HTTP and HTTPS ports when the gateway capability is off. */
export declare const GATEWAY_DISABLED_REASON = "gateway capability disabled";
export declare const DEFAULT_HOST_PORT_RANGES: {
    readonly ingressHttp: {
        readonly start: 8080;
        readonly end: 8180;
    };
    readonly ingressHttps: {
        readonly start: 8443;
        readonly end: 8543;
    };
    readonly postgres: {
        readonly start: 15432;
        readonly end: 15532;
    };
};
declare const REQUESTED_PORTS: {
    readonly ingressHttp: 80;
    readonly ingressHttps: 443;
    readonly postgres: 5432;
};
export declare const PREFERRED_HOST_PORTS: Partial<Record<keyof typeof REQUESTED_PORTS, number>>;
/**
 * Whether a failed bind on 127.0.0.1 means the port is still free for Docker. Only macOS
 * refuses a non-root bind below 1024 while Docker Desktop publishes it through a privileged
 * helper. Callers check for a listener first, so a bind error here is never another process.
 */
export declare function isPrivilegedBindFree(errorCode: string | undefined, platform: NodeJS.Platform): boolean;
export declare function isHostPortAvailable(port: number): Promise<boolean>;
export declare function createHostPortPlan(options?: HostPortPlanOptions): Promise<HostPortPlan>;
export declare function formatHostPortPlan(plan: HostPortPlan): string;
/** The plan with HTTP and HTTPS marked as not needed, for a project whose gateway capability is off. */
export declare function withoutGatewayPorts(plan: HostPortPlan): HostPortPlan;
export {};
