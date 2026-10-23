import type { CheckResult, DiscoveredResource } from "../types/index.js";
/** A dependsOn that is not a list of service names cannot be followed, so say so instead of failing later. */
export declare function checkDependsOnShape(projectRoot?: string, resources?: DiscoveredResource[]): CheckResult;
/** Services that wait on each other can never both start. A dependsOn name that is not a service is left to the unknown-name check. */
export declare function checkCircularDependencies(projectRoot?: string, resources?: DiscoveredResource[]): CheckResult;
/** A port outside 1-65535 can never be bound, and `flisk up` would otherwise find out only when Docker fails. */
export declare function checkServicePorts(projectRoot?: string, resources?: DiscoveredResource[]): CheckResult;
/**
 * A service.json with no schemaVersion is how every project began, so this is a warning: it keeps working, and only
 * `flisk config migrate` writes the field. A version this flisk does not know is reported the same way, with a different fix.
 */
export declare function checkSchemaVersions(projectRoot?: string, strict?: boolean, resources?: DiscoveredResource[]): CheckResult;
/** Prints the schemaVersion warning once. It never stops anything: the project keeps working as it is. */
export declare function warnSchemaVersions(projectRoot: string, resources?: DiscoveredResource[]): void;
/**
 * Runs before anything starts (also under --dry-run, like the drift gate): duplicate service names, circular
 * dependsOn and invalid ports exit with 1 and say which file, which field, and how to fix it.
 */
export declare function enforceServiceConfigGate(projectRoot: string, options?: {
    onInvalid?: (message: string) => void;
    resources?: DiscoveredResource[];
}, exit?: (code: number) => never): void;
