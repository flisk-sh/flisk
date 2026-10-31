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
    /** How a listing is submitted, in plain words. */
    submit: string;
    /** Field limits and rules, in plain words. */
    limits: string[];
}
export declare const CHANNELS: readonly Channel[];
export declare const TAGLINE_LIMIT = 60;
export declare const REGISTRY_DESCRIPTION_LIMIT = 100;
export declare const OPENAI_NAME_LIMIT = 30;
export declare const OPENAI_SHORT_DESCRIPTION_LIMIT = 30;
export declare const OPENAI_LONG_DESCRIPTION_LIMIT = 4000;
export declare const PRODUCT_HUNT_DESCRIPTION_LIMIT = 260;
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
    /** How a release goes out (for example "tag v*, CI publishes"). */
    release?: string;
    /** License of the published app, such as MIT. */
    license?: string;
    /** Where users get help: a URL or an email. */
    support?: string;
    apps: Record<string, DistributionApp>;
}
export declare function isMcpResource(resource: DiscoveredResource): boolean;
/** Reads distribution.json, or null when the project has none. Throws a FliskError when it is malformed. */
export declare function readDistributionFile(projectRoot: string): DistributionFile | null;
/** Warnings about a distribution.json that loads but looks wrong, such as an unknown channel id. */
export declare function distributionWarnings(dist: DistributionFile | null): string[];
/** Adds the missing apps and channels to an existing distribution.json and keeps every entry already there. */
export declare function mergeDistribution(existing: DistributionFile, resources: DiscoveredResource[]): DistributionFile;
/** The empty distribution.json for these resources: every channel todo, MCP-only channels n/a for other types. */
export declare function createInitialDistribution(resources: DiscoveredResource[]): DistributionFile;
/** Zachman's six perspectives, top to bottom, each with the lifecycle stage it answers for. */
export declare const BOARD_ROWS: readonly [{
    readonly perspective: "Planner";
    readonly view: "Scope";
    readonly stage: "Idea";
}, {
    readonly perspective: "Owner";
    readonly view: "Business";
    readonly stage: "Promise";
}, {
    readonly perspective: "Designer";
    readonly view: "System";
    readonly stage: "Shape";
}, {
    readonly perspective: "Builder";
    readonly view: "Technology";
    readonly stage: "Ship";
}, {
    readonly perspective: "Subcontractor";
    readonly view: "Component";
    readonly stage: "Listed";
}, {
    readonly perspective: "User";
    readonly view: "Operations";
    readonly stage: "Proof";
}];
export declare const BOARD_COLUMNS: readonly ["What", "How", "Where", "Who", "When", "Why"];
export type BoardPerspective = (typeof BOARD_ROWS)[number]["perspective"];
export type BoardColumn = (typeof BOARD_COLUMNS)[number];
export interface BoardCell {
    text: string;
    isMissing: boolean;
}
export interface BoardRow {
    perspective: BoardPerspective;
    view: string;
    stage: string;
    cells: Record<BoardColumn, BoardCell>;
}
export interface Board {
    rows: BoardRow[];
}
/**
 * The Zachman board. Rows are the six perspectives, columns the six questions. Every cell is read
 * from service.json or distribution.json; a cell with no data says what to add.
 */
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
/**
 * Tool and prompt names a resource registers, read from its source: registerTool("x"),
 * registerTool({ name: "x" }), server.tool("x") or mcp.tool("x") on an MCP server object, and
 * Python @mcp.tool / @mcp.tool(...) decorators. A .tool("x") call on any other object is not counted.
 */
export declare function readToolsAndPrompts(resourceDir: string): {
    tools: string[];
    prompts: string[];
};
export declare const URL_PLACEHOLDER = "https://REPLACE-ME.example.com/mcp";
/** A listing slug: lowercase letters, digits and single dashes. */
export declare function slugify(name: string): string;
export declare function buildKit(resource: DiscoveredResource, dist: DistributionFile | null): Kit;
/** Writes the kit under outDir. Refuses when any file exists, unless isForced. Returns the written paths. */
export declare function writeKit(kit: Kit, outDir: string, isForced: boolean): string[];
