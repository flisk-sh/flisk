import type { HostPortPlan } from "../types/index.js";
import type { NativeServicePlan } from "./native-runtime.js";
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
 * helper, and Colima and Lima through their pseudoloopback forwarder. Callers check for a
 * listener first, so a bind error here is never another process.
 */
export declare function isPrivilegedBindFree(errorCode: string | undefined, platform: NodeJS.Platform): boolean;
export declare function isHostPortAvailable(port: number): Promise<boolean>;
export declare function createHostPortPlan(options?: HostPortPlanOptions): Promise<HostPortPlan>;
export declare function formatHostPortPlan(plan: HostPortPlan): string;
/** The plan with HTTP and HTTPS marked as not needed, for a project whose gateway capability is off. */
export declare function withoutGatewayPorts(plan: HostPortPlan): HostPortPlan;
/**
 * The name a checkout was started under, when one was given. A plain project has none: its services keep the fixed ports
 * in service.json and a busy port is still an error. A worktree (or an orchestrator) supplies the name either as
 * `FLISK_CHECKOUT_NAME` in the run environment or as `worktree.name` / `checkout.name` in `.flisk/project.json` (#3117).
 * Names are normalised the same way as checkout folder names: lowercase, `[a-z0-9-]`.
 */
export declare function perCheckoutName(projectRoot: string, vars?: Readonly<Record<string, string | undefined>>): string | undefined;
/** How far past a service's declared port to look for a free one when the checkout's port is taken. */
export declare const CHECKOUT_PORT_MAX_OFFSET = 100;
export interface LocalPortRemapOptions {
    /** Port probe; defaults to a local listener check plus a bind on 127.0.0.1. */
    isAvailable?: (port: number) => Promise<boolean>;
    /** Ports already chosen earlier in this run (a restart reuses them instead of probing). */
    chosenPorts?: ReadonlyMap<string, number>;
    maxOffset?: number;
}
export interface LocalPortRemap {
    /** Service name to the port chosen for it, only for services whose declared port was busy. */
    ports: Map<string, number>;
}
/**
 * Apply previously chosen ports to a fresh plan (a `flisk restart` re-plans from service.json). Synchronous on purpose:
 * `NativeSupervisor`'s reload hook cannot await. No port is probed here; the ports were claimed when the run started.
 */
export declare function applyChosenNativePorts(plans: NativeServicePlan[], chosenPorts: ReadonlyMap<string, number>, declaredPorts: ReadonlyMap<string, number>): void;
/**
 * Remap a local process's declared port at run time when this checkout is running under its own name. The declared port
 * is left alone when it is free; only a busy one moves. Nothing is written to service.json: the new port lives in the
 * plan (and then in `.flisk/native/run.json`), `PORT` is injected into the service, and loopback URLs in its own and its
 * dependents' env are rewritten to the real address. Without a checkout name the plan is untouched, so a single checkout
 * still fails loudly in `runNativeUp`.
 */
export declare function remapNativeServicePorts(plans: NativeServicePlan[], checkoutName: string | undefined, options?: LocalPortRemapOptions): Promise<LocalPortRemap>;
export {};
