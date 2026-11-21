import type { DiscoveredResource } from "../../types/index.js";
import type { UrlTarget } from "./targets.js";
/**
 * Why a URL `flisk up` printed does not answer (#3211). `flisk up` says "ready" only when every printed URL answers, and names
 * one of these causes for each one that does not.
 */
export type UrlFailureCause = 
/** Nothing listens on the local ingress port, so Traefik itself is down or bound elsewhere. */
"gateway-not-listening"
/** Traefik answered with its own 404: it has no router for this host and path. */
 | "route-not-found"
/** Traefik's own 502/503/504: it has the route but nothing answers behind it, usually not on the declared port. */
 | "port-not-listening"
/** The service's container or process stopped. */
 | "container-exited"
/** The service's latest log lines say an environment variable it needs is not set. */
 | "missing-env"
/** No response within the probe timeout. */
 | "timeout"
/** The request failed some other way (DNS, reset, TLS, or a refused connection to a host that is not the local gateway). */
 | "no-response";
/** `<path>/health` for a URL, without doubling a trailing slash and leaving any query or fragment where it is. */
export declare function healthUrlOf(url: string): string;
/**
 * The health URL `flisk up` prints for a service, or null when it has none to print. Flisk's own service types answer
 * `/health`. A routed bring-your-own service's health path is its own (often `/`), so it gets one only when service.json
 * declares a `healthCheckPath` other than `/`, resolved against its URL.
 */
export declare function printedHealthUrl(resource: DiscoveredResource, url: string): string | null;
/** True for a URL whose host is this machine: the local ingress gateway that `flisk up` started. */
export declare function isLocalGatewayUrl(url: string): boolean;
/** The result of one probe, before any diagnosis from the service's state or logs. */
export interface UrlProbe {
    /** HTTP status, or undefined when no response came back. */
    status?: number;
    /** The first bytes of the body, to tell Traefik's own 404 from the service's. */
    body?: string;
    /** Why the request failed when no response came back (an error code such as ECONNREFUSED, or "timeout"). */
    error?: string;
}
/**
 * Whether a probe counts as an answer, and the cause when it does not. Any HTTP response from the service counts, a 404, 500
 * or its own 503 included: this checks that each printed URL is reachable, not that the app is healthy. Only Traefik's own
 * errors do not count, recognised by their body. A refused connection blames the gateway only when `url` is local; with a
 * `FLISK_SERVICE_BASE_URL` pointing elsewhere it is a plain request failure.
 */
export declare function classifyProbe(probe: UrlProbe, url?: string): {
    didAnswer: boolean;
    cause?: UrlFailureCause;
};
/**
 * The environment variable a service's latest log lines say is not set, or null. Only the last lines are read, so an old
 * message from a run that has since been fixed is not blamed for a new failure. A Python `KeyError` counts only when the
 * traceback reads `environ`, since a KeyError on its own is any missing dictionary key.
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
