import type { BackendFrameworkProvider } from "./types.js";
/** Hono is the historical default; omitting --framework keeps the exact historical output. */
export declare const DEFAULT_BACKEND_FRAMEWORK = "hono";
export declare const honoBackendProvider: BackendFrameworkProvider;
export declare const BACKEND_FRAMEWORKS: Record<string, BackendFrameworkProvider>;
export interface BackendFrameworkInventoryEntry {
    id: string;
    label: string;
    /**
     * The backend language ids this framework can be combined with, derived from the language registry.
     * The language id is also the runtime the service is scaffolded on (`bun` for every JS framework).
     */
    languages: string[];
    /** False when the framework cannot be combined with the requested `--language`. */
    compatible: boolean;
    /** The copy-pasteable `tdk resource` invocation. */
    command: string;
}
/**
 * Lists the registered backend frameworks with the language (and runtime) they are scaffolded with, so
 * `tdk resource --type backend --frameworks` is the whole backend discovery surface.
 *
 * `languageId` is the language the listing is judged against; the default Bun language is used when it
 * is omitted. A language that was asked for is named in the printed command, so copying a row never
 * scaffolds a different language than the one the listing was about.
 */
export declare function listBackendFrameworks(languageId?: string): BackendFrameworkInventoryEntry[];
export declare function getBackendFramework(frameworkId?: string): BackendFrameworkProvider;
/**
 * Returns the provider for an explicit `--framework` on a backend, or undefined when none was given
 * (the historical Hono scaffold). Python owns its runtime, so a framework cannot be combined with it.
 */
export declare function resolveBackendFramework(resourceType: string, frameworkId?: string, language?: {
    id: string;
    createFiles?: unknown;
}): BackendFrameworkProvider | undefined;
