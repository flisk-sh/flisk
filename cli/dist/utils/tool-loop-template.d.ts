/**
 * The tool-loop starter: the plain agent loop (the Anthropic SDK's tool runner) over the super-agent's MCP tool server, a
 * local mock of the Messages API so it runs offline, and a one-shot job that installs the SDK. All local processes.
 */
export declare const TOOL_LOOP_PORTS: {
    readonly agent: 4500;
    readonly tools: 4501;
    readonly model: 4502;
};
/** The service.json of each service, keyed by its path in the project folder. */
export declare function toolLoopManifests(): Record<string, Record<string, unknown>>;
/** Writes the tool-loop project into `dir`. */
export declare function writeToolLoopProject(dir: string, readTemplate?: (name: string) => string): void;
