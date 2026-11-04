import type { FrontendFrameworkProvider } from "./types.js";
/**
 * A plain Vite config for a frontend that runs on the host (`flisk resource --local`).
 *
 * The engine writes the full config under `flisk up` (runtime/engine/.../vite/frameworks/*.star), and that needs Tilt, so a
 * scaffold made for the host carries this small one instead: the framework's own plugins (from the provider's `vite` setup),
 * one port, and an optional proxy to the backend so the page can call it without CORS.
 */
export declare function renderLocalViteConfig(provider: FrontendFrameworkProvider, options: {
    port: number;
    proxyTarget?: string;
}): string;
/** The scripts of a host-run Vite frontend: no `--config` into the engine's output, and no pre-scripts that wait for it. */
export declare const LOCAL_VITE_SCRIPTS: {
    readonly dev: "vite";
    readonly build: "tsc && vite build";
    readonly preview: "vite preview";
};
