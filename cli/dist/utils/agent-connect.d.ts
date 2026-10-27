/**
 * `flisk connect <host>`: give a coding agent the Flisk runtime. It writes the `flisk mcp` server entry where the host
 * reads MCP servers (the formats in docs/agent-tooling/flisk-mcp-setup.md) and the Flisk skills where the host reads
 * skills (the same files `flisk project` writes). Every write is a merge: other servers and other keys stay, and a
 * second run changes nothing.
 */
export declare const CONNECT_HOSTS: readonly ["claude", "cursor", "codex"];
export type ConnectHost = (typeof CONNECT_HOSTS)[number];
export type ConnectScope = "project" | "global";
export declare const MCP_SERVER_NAME = "flisk";
interface HostSpec {
    label: string;
    format: "json" | "toml";
    /** The MCP config file, relative to the project root. */
    projectFile: string;
    /** The MCP config file in the user's home directory, or null when Flisk does not edit the host's user config. */
    globalFile: string | null;
    /** The skill directories the host reads, relative to the project root. */
    skillDirs: readonly string[];
    /** What to do after connecting. */
    next: string[];
}
export declare const HOST_SPECS: Record<ConnectHost, HostSpec>;
/** Resolve a host name or alias, or throw a FliskError that lists the hosts and the closest match. */
export declare function resolveConnectHost(input: string): ConnectHost;
/** The MCP server entry for a JSON config (Claude Code, Cursor). */
/** Cursor's variable for the folder that holds .cursor/mcp.json, written literally into the config. */
export declare const CURSOR_WORKSPACE_FOLDER: string;
export declare function jsonServerEntry(host: ConnectHost, platform?: NodeJS.Platform): Record<string, unknown>;
/** The `[mcp_servers.flisk]` table for Codex. A project entry pins `cwd` to the project root. */
export declare function tomlServerBlock(projectRoot: string | null): string;
export type ChangeAction = "create" | "update" | "unchanged" | "kept";
export interface ConnectChange {
    /** Absolute path of the file. */
    path: string;
    kind: "mcp" | "skill";
    /**
     * create: the file is new. update: the file exists and gains or replaces the flisk entry (or skill text).
     * unchanged: already up to date. kept: a different flisk entry or an edited skill is already there and is left
     * alone; `--force` replaces it.
     */
    action: ChangeAction;
}
export interface ConnectOptions {
    host: ConnectHost;
    scope: ConnectScope;
    projectRoot: string;
    homeDir: string;
    dryRun?: boolean;
    force?: boolean;
    platform?: NodeJS.Platform;
}
export interface ConnectResult {
    host: ConnectHost;
    label: string;
    scope: ConnectScope;
    projectRoot: string;
    dryRun: boolean;
    changes: ConnectChange[];
    next: string[];
}
/**
 * Plan, and unless `dryRun` is set apply, the connection of one host. Writes only to the host's MCP config file
 * (in the project, or with scope `global` in the home directory) and, for scope `project`, to the host's skill
 * directories in the project. Throws before writing anything when a config file cannot be merged.
 */
export declare function connectAgentHost(options: ConnectOptions): ConnectResult;
export {};
