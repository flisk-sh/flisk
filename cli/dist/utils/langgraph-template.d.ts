/**
 * The LangGraph starter: an agent built as a LangGraph StateGraph with file checkpoints, the super-agent's MCP tool server,
 * and a one-shot job that installs the agent's packages before it starts. All local processes (no Docker).
 */
export declare const LANGGRAPH_PORTS: {
    readonly agent: 4400;
    readonly tools: 4401;
};
/** The service.json of each service, keyed by its path in the project folder. */
export declare function langgraphManifests(): Record<string, Record<string, unknown>>;
/** Writes the LangGraph project into `dir`. */
export declare function writeLanggraphProject(dir: string, readTemplate?: (name: string) => string): void;
