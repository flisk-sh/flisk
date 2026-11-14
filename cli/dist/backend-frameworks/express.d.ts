import type { BackendFrameworkProvider } from "./types.js";
export declare function getExpressIndexTemplate(name: string, _durability?: string, options?: {
    port?: number;
}): string;
export declare const expressBackendProvider: BackendFrameworkProvider;
