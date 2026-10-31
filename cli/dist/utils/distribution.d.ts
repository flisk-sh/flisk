import type { DiscoveredResource } from "../types/index.js";
export declare const DISTRIBUTION_FILE = "distribution.json";
export declare const CHANNEL_STATUSES: readonly ["live", "review", "draft", "blocked", "todo", "n/a"];
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];
export declare const STATUS_ICONS: Record<ChannelStatus, string>;
export interface Channel {
    id: string;
    name: string;
    /** True when the channel only lists MCP servers. */
    isMcpOnly: boolean;
    /** Field limits and rules, in plain words. */
    limits: string[];
}
export declare const CHANNELS: readonly Channel[];
export declare const TAGLINE_LIMIT = 60;
export declare const REGISTRY_DESCRIPTION_LIMIT = 100;
export declare const OPENAI_NAME_LIMIT = 30;
export interface ChannelEntry {
    status: ChannelStatus;
    url?: string;
    date?: string;
    note?: string;
}
export interface DistributionApp {
    name?: string;
    tagline?: string;
    description?: string;
    bestFor?: string[];
    url?: string;
    homepage?: string;
    repository?: string;
    version?: string;
    reviewerNotes?: string;
    channels?: Record<string, ChannelEntry>;
}
export interface DistributionFile {
    schemaVersion: 1;
    owner?: string;
    githubOwner?: string;
    audience?: string;
    launch?: string;
    why?: string;
    promise?: string;
    apps: Record<string, DistributionApp>;
}
export declare function isMcpResource(resource: DiscoveredResource): boolean;
/** Reads distribution.json, or null when the project has none. Throws a FliskError when it is malformed. */
export declare function readDistributionFile(projectRoot: string): DistributionFile | null;
/** The empty distribution.json for these resources: every channel todo, MCP-only channels n/a for other types. */
export declare function createInitialDistribution(resources: DiscoveredResource[]): DistributionFile;
export declare const BOARD_ROWS: readonly ["Idea", "Promise", "Shape", "Ship", "Listed", "Proof"];
export declare const BOARD_COLUMNS: readonly ["What", "How", "Where", "Who", "When", "Why"];
export type BoardRow = (typeof BOARD_ROWS)[number];
export type BoardColumn = (typeof BOARD_COLUMNS)[number];
export interface BoardCell {
    text: string;
    isMissing: boolean;
}
export interface Board {
    rows: {
        stage: BoardRow;
        cells: Record<BoardColumn, BoardCell>;
    }[];
}
export declare function buildBoard(resources: DiscoveredResource[], dist: DistributionFile | null): Board;
export declare function formatBoard(board: Board): string;
export interface StatusGrid {
    apps: string[];
    channels: {
        id: string;
        name: string;
        cells: Record<string, ChannelEntry>;
    }[];
}
export declare function buildStatusGrid(dist: DistributionFile): StatusGrid;
export declare function formatStatusGrid(grid: StatusGrid): string;
export interface KitFile {
    path: string;
    content: string;
}
export interface Kit {
    resource: string;
    files: KitFile[];
    warnings: string[];
}
/** Tool and prompt names a resource registers, read from its source (registerTool("x"), server.tool("x"), @mcp.tool). */
export declare function readToolsAndPrompts(resourceDir: string): {
    tools: string[];
    prompts: string[];
};
export declare const URL_PLACEHOLDER = "https://REPLACE-ME.example.com/mcp";
export declare function buildKit(resource: DiscoveredResource, dist: DistributionFile | null): Kit;
/** Writes the kit under outDir. Refuses when any file exists, unless isForced. Returns the written paths. */
export declare function writeKit(kit: Kit, outDir: string, isForced: boolean): string[];
