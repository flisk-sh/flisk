import type { DiscoveredResource } from "../types/index.js";
/**
 * A service.json that declares a schemaVersion this flisk does not know is refused before anything starts: a newer format
 * read as if it were the old one could start the wrong thing. A missing schemaVersion is not refused (see
 * warnSchemaVersions), because every project began without one.
 */
export declare function enforceSchemaVersionGate(projectRoot: string, options?: {
    onInvalid?: (message: string) => void;
    resources?: DiscoveredResource[];
}, exit?: (code: number) => never): void;
