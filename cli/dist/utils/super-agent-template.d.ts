/**
 * The super-agent starter: a planner, an MCP tool server and three sub-agents (researcher, writer, checker), all local
 * processes (no Docker). The planner plans with rules, or with Claude when ANTHROPIC_API_KEY is set.
 */
export declare const SUPER_AGENT_PORTS: {
    readonly planner: 4300;
    readonly tools: 4301;
    readonly researcher: 4302;
    readonly writer: 4303;
    readonly checker: 4304;
};
/** The service.json of each service, keyed by its path in the project folder. */
export declare function superAgentManifests(): Record<string, Record<string, unknown>>;
/** Writes the super-agent project into `dir`. */
export declare function writeSuperAgentProject(dir: string, readTemplate?: (name: string) => string): void;
