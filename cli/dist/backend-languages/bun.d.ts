import type { BackendLanguageProvider } from "./types.js";
export declare function getBackendIndexTemplate(name: string): string;
/** The Bun + Hono backend with a `/health/db` route that runs a query through the Drizzle client. */
export declare function getDrizzleBackendIndexTemplate(name: string): string;
/**
 * The historical default. Package scripts, tsconfig, Dockerfile, and the vitest smoke test stay in
 * the shared scaffold so omitted-language output is byte-identical to before providers existed.
 */
export declare const bunBackendProvider: BackendLanguageProvider;
