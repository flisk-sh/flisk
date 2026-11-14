import type { BackendFrameworkProvider } from "./types.js";
export declare function getKoaIndexTemplate(name: string, _durability?: string, options?: {
    port?: number;
}): string;
export declare const koaBackendProvider: BackendFrameworkProvider;
