/**
 * A post-start check a service declares in service.json. It runs through the URL `flisk up` prints (Traefik), not inside the
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
    /**
     * Masks the secret values the project knows about. Throwing means the text could not be masked safely, and the runner then
     * neither shows nor stores it.
     */
    redact?: (text: string) => string;
    /** Reports a problem that does not change the smoke result, such as a body that could not be stored safely. */
    warn?: (message: string) => void;
}
export declare const DEFAULT_SMOKE_TIMEOUT_SECONDS = 60;
/** Largest response body kept in a smoke record. */
export declare const SMOKE_RECORD_BODY_MAX_BYTES: number;
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function validateSmoke(smoke: unknown): string[];
