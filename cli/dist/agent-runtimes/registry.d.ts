import type { BackendFrameworkProvider } from "../backend-frameworks/types.js";
/**
 * Agent runtimes an `agent` resource can be scaffolded with. No runtime is privileged: each is a scaffold plus the
 * process contract in its index file, and `custom` is the default because it has no vendor dependency.
 */
export declare const AGENT_RUNTIMES: Record<string, BackendFrameworkProvider>;
export declare const DEFAULT_AGENT_RUNTIME = "custom";
export declare const AGENT_DURABILITY_OPTIONS: readonly ["files", "postgres"];
export type AgentDurability = (typeof AGENT_DURABILITY_OPTIONS)[number];
export declare function resolveAgentRuntime(runtimeId?: string): BackendFrameworkProvider;
export declare function resolveAgentDurability(value?: string): AgentDurability;
