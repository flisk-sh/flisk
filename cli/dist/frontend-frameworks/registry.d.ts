import type { FrontendFrameworkProvider } from "./types.js";
export declare const DEFAULT_FRONTEND_FRAMEWORK = "react";
export declare const FRONTEND_FRAMEWORKS: Record<string, FrontendFrameworkProvider>;
export declare const META_FRAMEWORK_IDS: readonly ["nuxt", "sveltekit", "astro", "angular", "remix", "tanstack-start"];
export declare const VERIFIED_FRONTEND_FRAMEWORKS: readonly string[];
export interface FrontendFrameworkInventoryEntry {
    id: string;
    label: string;
    kind: "vite-spa" | "server";
    verified: boolean;
    command: string;
}
export declare function listFrontendFrameworks(): FrontendFrameworkInventoryEntry[];
export declare function getFrontendFramework(frameworkId?: string, resourceName?: string): FrontendFrameworkProvider;
export declare function resolveFrontendFramework(resourceType: string, frameworkId?: string, resourceName?: string): FrontendFrameworkProvider | undefined;
