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
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    compilerOptions: Record<string, string>;
    createFiles(name: string, options?: FrontendFrameworkOptions): FrontendFrameworkFile[];
}
