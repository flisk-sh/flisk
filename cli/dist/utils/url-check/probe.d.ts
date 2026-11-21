import type { UrlProbe } from "./classify.js";
import type { UrlCheck, UrlTarget } from "./targets.js";
/** What the diagnosis may learn about a service after its URL failed. Each lookup is optional and may return null. */
export interface UrlDiagnosisDeps {
    /** True when the service's container or process has exited. */
    hasExited?: (service: string) => Promise<boolean | null>;
    /** The service's recent log text. */
    logs?: (service: string) => Promise<string | null>;
}
export type UrlProber = (url: string, timeoutMs: number) => Promise<UrlProbe>;
/** Per-request timeout: short, because the stack already reported ready and a live route answers in milliseconds. */
export declare const URL_PROBE_TIMEOUT_MS = 3000;
/** How long a failing URL is retried: Traefik can take a moment to pick up a route after the container turns healthy. */
export declare const URL_CHECK_DEADLINE_MS = 15000;
/**
 * How long a URL is retried when its last attempt timed out instead of being refused: something is listening but slow,
 * typically a dev server compiling on its first request (Vite), which can take longer than the usual deadline.
 */
export declare const URL_SLOW_DEADLINE_MS = 60000;
/** At most this many requests at once, so a large stack does not hit the gateway with every URL in the same instant. */
export declare const URL_CHECK_CONCURRENCY = 8;
/**
 * Probes every target until it answers or the deadline passes, then diagnoses each one that still does not: a missing
 * environment variable named in the service's logs, or an exited container, take precedence over what the probe alone says.
 */
export declare function checkPrintedUrls(targets: readonly UrlTarget[], options?: {
    probe?: UrlProber;
    diagnosis?: UrlDiagnosisDeps;
    timeoutMs?: number;
    deadlineMs?: number;
    slowDeadlineMs?: number;
    intervalMs?: number;
    concurrency?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
}): Promise<UrlCheck[]>;
/** The lines `flisk up` prints for the URLs that do not answer. */
export declare function formatUrlFailures(checks: readonly UrlCheck[]): string[];
/** The distinct next commands of the failed checks, in order, for the error's suggestions. */
export declare function urlFailureSuggestions(checks: readonly UrlCheck[]): string[];
/** True when the Tilt resource of a service has exited (`runtimeStatus: error`), read from `tilt get uiresources -o json`. */
export declare function tiltResourceHasExited(uiResourcesJson: string, service: string): boolean | null;
/**
 * GET one URL and keep its status and the start of its body. A `*.localhost` host is sent to 127.0.0.1 with its Host header:
 * not every resolver maps subdomains of localhost (glibc does not), and fetch drops a Host header that is set by hand.
 */
export declare function probeUrl(url: string, timeoutMs: number): Promise<UrlProbe>;
