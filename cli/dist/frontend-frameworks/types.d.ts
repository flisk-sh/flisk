export interface FrontendFrameworkFile {
    filename: string;
    content: string;
    description: string;
    emoji: string;
}
export interface FrontendFrameworkOptions {
    /** The backend resource in the same stack. The starter shows a backend health card only when it is set. */
    backendName?: string;
}
/**
 * The Vite plugins a `vite-spa` framework needs. `flisk resource --local` writes a plain `vite.config.ts` from this, so the
 * app runs with `npm run dev` and no engine (Tilt writes the full config under `flisk up`). An empty list is a framework that
 * needs no plugin (Lit, vanilla TypeScript).
 */
export interface FrontendViteSetup {
    /** Complete import statements, for example `import react from '@vitejs/plugin-react';`. */
    imports: string[];
    /** Expressions for the `plugins` array, for example `react()`. */
    plugins: string[];
}
export interface FrontendFrameworkProvider {
    id: string;
    label: string;
    /**
     * `vite-spa` (the default) is built by the shared Vite builder and served by nginx. `server` owns its
     * build and dev server (Next.js): the engine runs it on Node, in a development image under `flisk up`.
     */
    kind?: "vite-spa" | "server";
    /** package.json scripts for a `server` framework; replaces the Vite `dev`/`build` scripts. */
    scripts?: Record<string, string>;
    /** Complete tsconfig.json for a `server` framework; replaces the shared SPA template. */
    tsconfig?: {
        compilerOptions: Record<string, unknown>;
        include: string[];
        exclude: string[];
    };
    /** Set for a `vite-spa` framework that can run on the host with `flisk resource --local`. */
    vite?: FrontendViteSetup;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    compilerOptions: Record<string, string>;
    createFiles(name: string, options?: FrontendFrameworkOptions): FrontendFrameworkFile[];
}
