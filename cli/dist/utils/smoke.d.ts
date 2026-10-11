import type { DiscoveredResource } from "../types/index.js";
/**
 * A post-start check a service declares in service.json. It runs through the URL `tdk up` prints (Traefik), not inside the
 * container, so it catches what `healthCheckPath` cannot: a route Traefik never registered, a shared router, a database the
 * service is not actually using.
 */
export interface SmokeStep {
    name?: string;
    method?: string;
    /** Appended to the service's public base URL. Must start with `/`. `{{name}}` is replaced by a value saved by an earlier step. */
    path: string;
    body?: unknown;
    /** Expected HTTP status. Defaults to 200. */
    expect?: number;
    bodyContains?: string;
    /** Saves response fields for later steps: `{ "id": "$.id" }`. Supports `$.a.b[0]`. */
    save?: Record<string, string>;
}
export interface SmokeConfig {
    via: "proxy";
    timeoutSeconds?: number;
    steps: SmokeStep[];
}
export interface SmokePlan {
    name: string;
    baseUrl: string;
    /** Appended to `baseUrl` and polled with GET before the first step, so a write is never the first request to reach a service that is still starting. */
    readyPath?: string;
    smoke: SmokeConfig;
}
export interface SmokeResult {
    name: string;
    ok: boolean;
    failure?: string;
    /** Path of the `latest.json` of the step that failed, when a record was written. */
    recordPath?: string;
}
export interface SmokeDeps {
    fetch?: (url: string, init: {
        method: string;
        headers?: Record<string, string>;
        body?: string;
        signal?: AbortSignal;
    }) => Promise<{
        status: number;
        text(): Promise<string>;
    }>;
    now?: () => number;
    /** Directory the per-step records go under (`<dir>/<service>/<step-slug>/`). No directory, no records. */
    recordDir?: string;
    sleep?: (ms: number) => Promise<void>;
}
export declare const DEFAULT_SMOKE_TIMEOUT_SECONDS = 60;
/** Largest response body kept in a smoke record. */
export declare const SMOKE_RECORD_BODY_MAX_BYTES: number;
export declare function validateSmoke(smoke: unknown): string[];
/** One plan per routable service that declares `smoke`. Workers and BYO with exposeViaProxy false have no public route. */
export declare function buildSmokePlans(resources: DiscoveredResource[], ingressPort?: number): SmokePlan[];
/**
 * The GET-only part of each smoke block, for `tdk doctor`. Doctor must never write to a service, and a step whose path reads
 * a value saved by an earlier write (`{{name}}`) cannot run on its own, so both are dropped. A service with no such steps is left out.
 * `bodyContains` is also cleared: it asserts on data that earlier writes created, so doctor would fail a healthy route whose data was removed.
 * The status check stays, which is what shows a route exists.
 */
export declare function readOnlySmokePlans(plans: SmokePlan[], options?: {
    timeoutSeconds?: number;
}): SmokePlan[];
/** Runs the steps in order. A not-ready answer (connection error, 404, 502-504) is retried until the timeout; a real wrong answer fails at once. */
export declare function runSmokePlan(plan: SmokePlan, deps?: SmokeDeps): Promise<SmokeResult>;
export declare function formatSmokeFailure(result: SmokeResult): string;
/** Runs every plan side by side; each plan keeps its own timeout. */
export declare function runSmokePlans(plans: SmokePlan[], deps?: SmokeDeps): Promise<SmokeResult[]>;
