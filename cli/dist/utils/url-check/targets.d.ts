import type { DiscoveredResource } from "../../types/index.js";
import type { UrlFailureCause } from "./classify.js";
/** One URL `flisk up` prints, and the service it belongs to. */
export interface UrlTarget {
    service: string;
    url: string;
    /** The service's declared port, named in the port-not-listening message. */
    port?: number;
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
/**
 * The URLs `flisk up` prints for the services it started: each routed service's URL and its health URL. Deferred services
 * (Sablier `deferStart`) are left out: a request would start them, and they are printed as starting on first request.
 */
export declare function buildPrintedUrlTargets(resources: readonly DiscoveredResource[], ingressPort: number | undefined, deferred?: ReadonlySet<string>): UrlTarget[];
