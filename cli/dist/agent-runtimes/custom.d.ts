import type { BackendFrameworkProvider } from "../backend-frameworks/types.js";
/**
 * The `custom` agent runtime: a plain Bun HTTP service with no model SDK, no agent framework and no vendor dependency.
 * It is the escape hatch the agent resource type is built on. Replace the `runTurn` body with your model call and tools;
 * the process contract around it (health, readiness, session checkpoints, SIGTERM drain) is what TDK relies on.
 */
export declare function getCustomAgentIndexTemplate(name: string, durability?: "files" | "postgres"): string;
export declare const customAgentRuntime: BackendFrameworkProvider;
