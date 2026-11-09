import type { DiscoveredResource } from "../types/index.js";
interface InferredNodeProject {
    kind: "service";
    service: DiscoveredResource;
    command: string;
    script: string;
}
/** Infer a Node project from package.json when no Flisk project exists. Returns null if not applicable. */
export declare function inferNodeProject(cwd: string): InferredNodeProject | null;
/** The home-based state root for an inferred project. */
export declare function inferredStateRoot(cwd: string): string;
export {};
