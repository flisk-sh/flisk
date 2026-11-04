import type { CheckResult, DiscoveredResource } from "../types/index.js";
/**
 * Env values that point outside the local stack (#2874).
 *
 * A local stack is only isolated if every service talks to the local parts. A `.env` or `service.json` value that still
 * names a shared dev or production host makes "running locally" mean "one service locally against everyone else's cloud":
 * data lands in shared environments and requests fail with unexplained 401s. This check reports such values by service,
 * variable name and host. It never prints a value, which may carry a password or token.
 */
export interface RemoteEnvHostFinding {
    /** The service the value reaches, or "(project)" for the project `.env`. */
    service: string;
    variable: string;
    host: string;
    /** Where the value is set, relative to the project root (a file, or `service.json env` / `service.json params`). */
    source: string;
}
/**
 * The host a value points at, or undefined when it names none: a URL (`https://api.example.com/x`,
 * `postgres://u:p@db.example.com:5432/app`), or the plain value of a `*_HOST`/`*_HOSTNAME`/`*_DOMAIN` variable.
 */
export declare function hostOfValue(key: string, value: string): string | undefined;
/**
 * True when a host is part of the local stack: localhost and the local suffixes, a loopback or private IP, a one-word
 * name (a Compose service or container on the stack network), a discovered service or stack, or an allowed host.
 */
export declare function isLocalHost(host: string, localNames: ReadonlySet<string>, allowedHosts?: readonly string[]): boolean;
/** `allowedHosts` from `.flisk/project.json`: hosts that are meant to be remote (a payment sandbox, a model API). */
export declare function readAllowedHosts(projectRoot: string): string[];
/** Every env value in the project that points at a host outside the local stack. */
export declare function scanRemoteEnvHosts(projectRoot: string, resources?: readonly DiscoveredResource[]): RemoteEnvHostFinding[];
/**
 * `flisk doctor`: env values that point outside the local stack. A warning by default (a remote host can be intended);
 * a failure with --strict. Names the service, the variable, the host and where it is set, never the value.
 */
export declare function checkRemoteEnvHosts(projectRoot?: string, strict?: boolean): CheckResult;
