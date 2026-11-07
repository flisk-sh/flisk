import type { DiscoveredResource } from "../types/index.js";
/**
 * Why a URL `flisk up` printed does not answer (#3211). `flisk up` says "ready" only when every printed URL answers, and names
 * one of these causes for each one that does not.
 */
export type UrlFailureCause = 
/** Nothing listens on the ingress port, so Traefik itself is down or bound elsewhere. */
"gateway-not-listening"
/** Traefik answered with its own 404: it has no router for this host and path. */
 | "route-not-found"
/** Traefik has the route but nothing answers behind it (502/503/504): the process does not listen on its declared port. */
 | "port-not-listening"
/** The service's container or process stopped. */
 | "container-exited"
/** The service's logs name an environment variable it needs and does not have. */
 | "missing-env"
/** No response within the probe timeout. */
 | "timeout"
/** The request failed some other way (DNS, reset, TLS). */
 | "no-response";
/** One URL `flisk up` prints, and the service it belongs to. */
export interface UrlTarget {
    service: string;
    url: string;
    /** The service's declared port, named in the port-not-listening message. */
    port?: number;
}
/** The result of one probe, before any diagnosis from the service's state or logs. */
export interface UrlProbe {
    /** HTTP status, or undefined when no response came back. */
    status?: number;
    /** The first bytes of the body, to tell Traefik's own 404 from the service's. */
    body?: string;
    /** Why the request failed when no response came back (an error code such as ECONNREFUSED, or "timeout"). */
    error?: string;
}
/** The per-URL result `flisk up` prints and carries in `flisk up --json` (`data.urls`). */
export interface UrlCheck {
    service: string;
    url: string;
    didAnswer: boolean;
    status?: number;
    cause?: UrlFailureCause;
    /** What is wrong, in a user's words. */
    message?: string;
    /** The one command to run next. */
    nextCommand?: string;
    /** For `missing-env`: the variable the service asked for. */
    envName?: string;
}
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
 * The URLs `flisk up` prints for the services it started: each routed service's URL and its health URL. Deferred services
 * (Sablier `deferStart`) are left out: a request would start them, and they are printed as starting on first request.
 */
export declare function buildPrintedUrlTargets(resources: readonly DiscoveredResource[], ingressPort: number | undefined, deferred?: ReadonlySet<string>): UrlTarget[];
/** The health URL `flisk up` prints for a service URL: `<url>/health`, without doubling a trailing slash. */
export declare function healthUrlOf(url: string): string;
/** Whether a probe counts as an answer, and the cause when it does not. Any HTTP response counts, except Traefik's own errors. */
export declare function classifyProbe(probe: UrlProbe): {
    didAnswer: boolean;
    cause?: UrlFailureCause;
};
/**
 * The environment variable a service's logs say it is missing, or null. Reads the last lines only, so an old message from a
 * run that has since been fixed does not count.
 */
export declare function findMissingEnvName(logs: string): string | null;
/** The message and next command for a URL that did not answer. */
export declare function describeUrlFailure(target: UrlTarget, failure: {
    cause: UrlFailureCause;
    status?: number;
    envName?: string;
    error?: string;
}): {
    message: string;
    nextCommand: string;
};
/**
 * Probes every target until it answers or the deadline passes, then diagnoses each one that still does not: a missing
 * environment variable named in the service's logs, or an exited container, take precedence over what the probe alone says.
 */
export declare function checkPrintedUrls(targets: readonly UrlTarget[], options?: {
    probe?: UrlProber;
    diagnosis?: UrlDiagnosisDeps;
    timeoutMs?: number;
    deadlineMs?: number;
    intervalMs?: number;
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
