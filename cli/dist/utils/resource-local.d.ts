import type { BackendLanguageProvider } from "../backend-languages/types.js";
import type { FrontendFrameworkProvider } from "../frontend-frameworks/types.js";
import type { FileGenerationTask } from "../types/index.js";
export interface LocalScaffoldInput {
    resourceName: string;
    resourceType: string;
    port: number;
    tasks: FileGenerationTask[];
    frontendFramework?: FrontendFrameworkProvider;
    /** A language that owns its runtime (Python, Go, Rust, Node); undefined for the shared Bun scaffold. */
    backendLanguage?: BackendLanguageProvider;
    /** Where the frontend's backend answers, so the dev server can proxy to it. */
    backendUrl?: string;
}
/**
 * The scaffolds listen on every interface because a container needs that. On your own computer that would put the app
 * on the café wifi, so every generated listener is pointed at localhost: a literal 0.0.0.0, Bun's default (Hono's
 * `export default { port }`), and Go's `":" + port`. Flisk's own probes and the website's proxy all use localhost.
 */
export declare function bindToLocalhost(tasks: FileGenerationTask[]): void;
/** `flisk up` on your computer starts plain processes and no Tilt, so the starter pages must not link to its UI. */
export declare function dropTiltLinks(tasks: FileGenerationTask[]): void;
/**
 * Turns a scaffold made for containers into one that runs on the host with no Docker and no Tilt.
 *
 * Only what is coupled to containers changes: the Dockerfile goes, `service.json` gets a `command` (so `flisk up` runs it as a
 * local process) instead of a build block, and a Vite frontend gets a plain config and scripts. The framework's source files,
 * dependencies and tests are the generator's own, untouched. Returns the command the service runs.
 */
export declare function applyLocalScaffold(input: LocalScaffoldInput): string;
/**
 * The port a `--local` resource gets. An explicit --port is kept as given; otherwise the assigned port, or the next one
 * that no other resource in the project uses and that nothing on this computer is listening on right now.
 */
export declare function localResourcePort(assignedPort: number, explicit: boolean, taken: readonly number[], isListening: (port: number) => Promise<boolean>): Promise<number>;
