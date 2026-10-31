// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * How an app gets to its users: the Zachman board, the listing kit and the channel grid behind
 * `flisk distribute`.
 *
 * Everything here reads and writes local files only. Nothing submits a listing, calls a marketplace
 * or a cloud API, or deploys. Output is deterministic: the same project gives the same board, kit
 * and grid.
 */
import fs from "node:fs";
import path from "node:path";
import type { DiscoveredResource } from "../types/index.js";
import { FliskError } from "./errors.js";

export const DISTRIBUTION_FILE = "distribution.json";

export const CHANNEL_STATUSES = ["live", "review", "draft", "blocked", "todo", "n/a"] as const;
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];

export const STATUS_ICONS: Record<ChannelStatus, string> = {
  live: "✅",
  review: "⏳",
  draft: "🟡",
  blocked: "⛔",
  todo: "⬜",
  "n/a": "—",
};

export interface Channel {
  id: string;
  name: string;
  /** True when the channel only lists MCP servers. */
  isMcpOnly: boolean;
  /** Field limits and rules, in plain words. */
  limits: string[];
}

export const CHANNELS: readonly Channel[] = [
  {
    id: "claude-directory",
    name: "Claude directory",
    isMcpOnly: true,
    limits: [
      "The slug cannot change after you submit.",
      "Pick at most 5 categories.",
      "Every tool needs a title and read-only or destructive hints.",
      "The server URL must be public https.",
    ],
  },
  {
    id: "toolradar",
    name: "Toolradar",
    isMcpOnly: false,
    limits: [
      "At most 2 submissions per hour.",
      "Needs a public website, a short tagline and a logo.",
    ],
  },
  {
    id: "product-hunt",
    name: "Product Hunt",
    isMcpOnly: false,
    limits: [
      "Tagline at most 60 characters.",
      "Description at most 500 characters.",
      "Gallery images 1270x760.",
    ],
  },
  {
    id: "mcp-registry",
    name: "Official MCP Registry",
    isMcpOnly: true,
    limits: [
      "Name in reverse-DNS form, such as io.github.<owner>/<name>.",
      "Description at most 100 characters.",
      "Publish server.json with mcp-publisher; it reads your GitHub login.",
    ],
  },
  {
    id: "glama",
    name: "Glama",
    isMcpOnly: true,
    limits: ["Needs a public GitHub repository with a license.", "Glama scans the repository."],
  },
  {
    id: "github-actions",
    name: "GitHub Actions Marketplace",
    isMcpOnly: false,
    limits: [
      "One action.yml at the repository root.",
      "description under 125 characters, a unique name, and branding (icon and color).",
    ],
  },
  {
    id: "npm",
    name: "npm",
    isMcpOnly: false,
    limits: ["Package name lowercase, at most 214 characters.", "Needs a README and a license."],
  },
  {
    id: "openai",
    name: "OpenAI (ChatGPT, Codex)",
    isMcpOnly: true,
    limits: [
      "displayName at most 30 characters.",
      "shortDescription at most 30 characters.",
      "longDescription at most 4000 characters.",
      "All URLs https; images square, at least 48 px, at most 5 MiB.",
    ],
  },
];

export const TAGLINE_LIMIT = 60;
export const REGISTRY_DESCRIPTION_LIMIT = 100;
export const OPENAI_NAME_LIMIT = 30;

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

export function isMcpResource(resource: DiscoveredResource): boolean {
  return resource.config?.appType === "mcp";
}

/** Reads distribution.json, or null when the project has none. Throws a FliskError when it is malformed. */
export function readDistributionFile(projectRoot: string): DistributionFile | null {
  const file = path.join(projectRoot, DISTRIBUTION_FILE);
  if (!fs.existsSync(file)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    throw new FliskError(
      `${DISTRIBUTION_FILE} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      ["Fix the file, or move it away and run flisk distribute status --init"],
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new FliskError(`${DISTRIBUTION_FILE} must hold a JSON object`, [
      "Run flisk distribute status --init --force to write a fresh one",
    ]);
  }
  const data = parsed as Partial<DistributionFile>;
  const apps = data.apps ?? {};
  if (typeof apps !== "object" || Array.isArray(apps)) {
    throw new FliskError(`${DISTRIBUTION_FILE}: "apps" must be an object keyed by resource name`, [
      'Write it as { "apps": { "<resource>": { "channels": {} } } }',
    ]);
  }
  for (const [appName, app] of Object.entries(apps)) {
    for (const [channel, entry] of Object.entries(app?.channels ?? {})) {
      if (!CHANNEL_STATUSES.includes(entry?.status as ChannelStatus)) {
        throw new FliskError(
          `${DISTRIBUTION_FILE}: ${appName} / ${channel} has status ${JSON.stringify(entry?.status)}`,
          [`Use one of: ${CHANNEL_STATUSES.join(", ")}`],
        );
      }
    }
  }
  return { ...data, schemaVersion: 1, apps } as DistributionFile;
}

/** The empty distribution.json for these resources: every channel todo, MCP-only channels n/a for other types. */
export function createInitialDistribution(resources: DiscoveredResource[]): DistributionFile {
  const apps: Record<string, DistributionApp> = {};
  for (const resource of [...resources].sort((a, b) => a.name.localeCompare(b.name))) {
    const channels: Record<string, ChannelEntry> = {};
    for (const channel of CHANNELS) {
      channels[channel.id] = {
        status: channel.isMcpOnly && !isMcpResource(resource) ? "n/a" : "todo",
      };
    }
    apps[resource.name] = { name: resource.name, tagline: "", description: "", channels };
  }
  return { schemaVersion: 1, apps };
}

// ---------------------------------------------------------------------------------------------
// Board

export const BOARD_ROWS = ["Idea", "Promise", "Shape", "Ship", "Listed", "Proof"] as const;
export const BOARD_COLUMNS = ["What", "How", "Where", "Who", "When", "Why"] as const;
export type BoardRow = (typeof BOARD_ROWS)[number];
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export interface BoardCell {
  text: string;
  isMissing: boolean;
}

export interface Board {
  rows: { stage: BoardRow; cells: Record<BoardColumn, BoardCell> }[];
}

const filled = (text: string): BoardCell => ({ text, isMissing: false });
const missing = (text: string): BoardCell => ({ text: `Missing: ${text}`, isMissing: true });
const orMissing = (value: string | undefined, hint: string): BoardCell =>
  value?.trim() ? filled(value.trim()) : missing(hint);

function listOr(values: string[], hint: string): BoardCell {
  return values.length > 0 ? filled(values.join(", ")) : missing(hint);
}

/** The channel entries of every app, flattened. */
function allEntries(dist: DistributionFile | null): ChannelEntry[] {
  return Object.values(dist?.apps ?? {}).flatMap((app) => Object.values(app.channels ?? {}));
}

function healthPath(resource: DiscoveredResource): string {
  return resource.config?.healthCheckPath ?? "/health";
}

export function buildBoard(resources: DiscoveredResource[], dist: DistributionFile | null): Board {
  const sorted = [...resources].sort((a, b) => a.name.localeCompare(b.name));
  const apps = dist?.apps ?? {};
  const appOf = (name: string): DistributionApp => apps[name] ?? {};
  const mcp = sorted.filter(isMcpResource);
  const entries = allEntries(dist);
  const count = (status: ChannelStatus) => entries.filter((e) => e.status === status).length;
  const dates = entries.flatMap((e) => (e.date ? [e.date] : [])).sort();
  const liveUrls = entries.flatMap((e) => (e.status === "live" && e.url ? [e.url] : [])).sort();
  const noDist = `no ${DISTRIBUTION_FILE}; run flisk distribute status --init`;
  const distHint = (field: string) => (dist ? `add "${field}" to ${DISTRIBUTION_FILE}` : noDist);
  const appHint = (field: string) =>
    dist ? `add "${field}" to each app in ${DISTRIBUTION_FILE}` : noDist;

  const taglines = sorted.flatMap((r) =>
    appOf(r.name).tagline ? [`${r.name}: ${appOf(r.name).tagline}`] : [],
  );
  const descriptions = sorted.flatMap((r) =>
    appOf(r.name).description ? [`${r.name}: ${appOf(r.name).description}`] : [],
  );
  const publicUrls = sorted.flatMap((r) => {
    const url = appOf(r.name).url ?? appOf(r.name).homepage;
    return url ? [`${r.name}: ${url}`] : [];
  });
  const versions = sorted.flatMap((r) =>
    appOf(r.name).version ? [`${r.name} ${appOf(r.name).version}`] : [],
  );

  const resourceList =
    sorted.length > 0
      ? filled(
          `${sorted.length} ${sorted.length === 1 ? "resource" : "resources"}: ${sorted
            .map((r) => `${r.name} (${r.config?.appType ?? "unknown"})`)
            .join(", ")}`,
        )
      : missing("no service.json found; create one with flisk resource <name>");

  const ports = sorted.flatMap((r) =>
    (r.port ?? r.config?.port) ? [`${r.name}:${r.port ?? r.config?.port}`] : [],
  );
  const mcpRoutes = mcp.map(
    (r) => `${r.name} ${appOf(r.name).url ?? `${r.config?.basePath ?? ""}/mcp`}`,
  );
  const types = [...new Set(sorted.map((r) => r.config?.appType ?? "unknown"))].sort();
  const clients = [
    ...(mcp.length > 0 ? ["AI clients over MCP (Claude, Codex, Gemini)"] : []),
    ...(sorted.some((r) => r.config?.appType === "frontend") ? ["people in a browser"] : []),
    ...(sorted.some((r) => r.config?.appType === "backend") ? ["other services over HTTP"] : []),
  ];
  const listedSummary =
    entries.length > 0
      ? filled(
          (["live", "review", "draft", "blocked", "todo"] as const)
            .map((s) => `${STATUS_ICONS[s]} ${count(s)} ${s}`)
            .join(", "),
        )
      : missing(dist ? "no channels in the apps yet" : noDist);
  const listedWhere = [
    ...new Set(
      Object.values(apps).flatMap((app) =>
        Object.entries(app.channels ?? {}).flatMap(([id, e]) =>
          e.status === "live" || e.status === "review"
            ? [CHANNELS.find((c) => c.id === id)?.name ?? id]
            : [],
        ),
      ),
    ),
  ].sort();

  const row = (stage: BoardRow, cells: BoardCell[]) => ({
    stage,
    cells: Object.fromEntries(BOARD_COLUMNS.map((c, i) => [c, cells[i]])) as Record<
      BoardColumn,
      BoardCell
    >,
  });

  return {
    rows: [
      row("Idea", [
        resourceList,
        filled("flisk up runs the whole stack"),
        filled("your computer (Docker and Tilt)"),
        orMissing(dist?.audience, distHint("audience")),
        orMissing(dist?.launch, distHint("launch")),
        orMissing(dist?.why, distHint("why")),
      ]),
      row("Promise", [
        listOr(taglines, appHint("tagline")),
        orMissing(dist?.promise, distHint("promise")),
        listOr(publicUrls, appHint("url")),
        orMissing(dist?.owner, distHint("owner")),
        filled("per listing, see flisk distribute status"),
        listOr(descriptions, appHint("description")),
      ]),
      row("Shape", [
        types.length > 0 ? filled(types.join(", ")) : missing("no resources"),
        mcp.length > 0
          ? filled(`MCP routes: ${mcpRoutes.join(", ")}`)
          : missing("no MCP resource; tools reach AI clients through one"),
        listOr(ports, "no ports in service.json"),
        listOr(clients, "no resource people or AI clients can reach"),
        listOr(versions, appHint("version")),
        listOr(
          sorted.map((r) => appOf(r.name).name ?? r.name),
          "no resources to name",
        ),
      ]),
      row("Ship", [
        listOr(
          sorted.map((r) => `${r.name} ${healthPath(r)}`),
          "no resources",
        ),
        filled("container images built by flisk; deploy them with your own workflow"),
        listOr(publicUrls, appHint("url")),
        orMissing(dist?.owner, distHint("owner")),
        missing("say when a release goes out; flisk never deploys"),
        filled("small services that each answer a health check"),
      ]),
      row("Listed", [
        listedSummary,
        filled("forms and reviews, by hand; flisk distribute kit writes the text"),
        listOr(listedWhere, "no channel is live or in review"),
        filled("each channel's reviewers"),
        listOr(
          dates.length > 0 ? [`last change ${dates[dates.length - 1]}`] : [],
          "no dates in the channel entries",
        ),
        filled("each channel's own rules, see listing.md in the kit"),
      ]),
      row("Proof", [
        count("live") > 0
          ? filled(`${count("live")} live listings`)
          : missing("no live listing yet"),
        filled("flisk doctor and flisk status check the running stack"),
        listOr(liveUrls, "no url on a live channel entry"),
        orMissing(dist?.audience, distHint("audience")),
        listOr(
          dates.length > 0 ? [dates[dates.length - 1] as string] : [],
          "no dates in the channel entries",
        ),
        filled("shows what to fix next"),
      ]),
    ],
  };
}

export function formatBoard(board: Board): string {
  const lines: string[] = [
    "Distribution board (rows are stages, columns are the six questions)",
    "",
  ];
  for (const { stage, cells } of board.rows) {
    lines.push(stage);
    for (const column of BOARD_COLUMNS) {
      const cell = cells[column];
      lines.push(`  ${column.padEnd(6)} ${cell.isMissing ? "⬜" : "✅"} ${cell.text}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------
// Status grid

export interface StatusGrid {
  apps: string[];
  channels: { id: string; name: string; cells: Record<string, ChannelEntry> }[];
}

export function buildStatusGrid(dist: DistributionFile): StatusGrid {
  const apps = Object.keys(dist.apps).sort();
  const extraIds = [
    ...new Set(Object.values(dist.apps).flatMap((app) => Object.keys(app.channels ?? {}))),
  ]
    .filter((id) => !CHANNELS.some((c) => c.id === id))
    .sort();
  const channelList = [
    ...CHANNELS.map((c) => ({ id: c.id, name: c.name })),
    ...extraIds.map((id) => ({ id, name: id })),
  ];
  return {
    apps,
    channels: channelList.map((channel) => ({
      ...channel,
      cells: Object.fromEntries(
        apps.map((app) => [
          app,
          dist.apps[app]?.channels?.[channel.id] ?? ({ status: "todo" } as ChannelEntry),
        ]),
      ),
    })),
  };
}

export function formatStatusGrid(grid: StatusGrid): string {
  const legend = CHANNEL_STATUSES.map((s) => `${STATUS_ICONS[s]} ${s}`).join(" · ");
  const header = ["Channel", ...grid.apps];
  const rows = grid.channels.map((c) => [
    c.name,
    ...grid.apps.map((app) => STATUS_ICONS[(c.cells[app] as ChannelEntry).status]),
  ]);
  const lines = [
    legend,
    "",
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  ];
  for (const r of rows) lines.push(`| ${r.join(" | ")} |`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------
// Kit

export interface KitFile {
  path: string;
  content: string;
}

export interface Kit {
  resource: string;
  files: KitFile[];
  warnings: string[];
}

const SOURCE_EXTENSIONS = new Set([".ts", ".js", ".mjs", ".cjs", ".py", ".go"]);
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  ".flisk",
  "build",
  "__pycache__",
  ".venv",
]);

function listSourceFiles(dir: string, out: string[] = [], depth = 0): string[] {
  if (depth > 6 || !fs.existsSync(dir)) return out;
  for (const entry of fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) listSourceFiles(full, out, depth + 1);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name)) && !entry.name.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

/** Tool and prompt names a resource registers, read from its source (registerTool("x"), server.tool("x"), @mcp.tool). */
export function readToolsAndPrompts(resourceDir: string): { tools: string[]; prompts: string[] } {
  const tools = new Set<string>();
  const prompts = new Set<string>();
  const toolRe = /\b(?:registerTool|\.tool)\(\s*["'`]([\w.-]+)["'`]/g;
  const promptRe = /\b(?:registerPrompt|\.prompt)\(\s*["'`]([\w.-]+)["'`]/g;
  const pyToolRe = /@\w+\.tool\([^)]*\)\s*\n\s*(?:async\s+)?def\s+(\w+)/g;
  const pyPromptRe = /@\w+\.prompt\([^)]*\)\s*\n\s*(?:async\s+)?def\s+(\w+)/g;
  for (const file of listSourceFiles(resourceDir)) {
    const text = fs.readFileSync(file, "utf-8");
    for (const m of text.matchAll(toolRe)) tools.add(m[1] as string);
    for (const m of text.matchAll(promptRe)) prompts.add(m[1] as string);
    for (const m of text.matchAll(pyToolRe)) tools.add(m[1] as string);
    for (const m of text.matchAll(pyPromptRe)) prompts.add(m[1] as string);
  }
  return { tools: [...tools].sort(), prompts: [...prompts].sort() };
}

export const URL_PLACEHOLDER = "https://REPLACE-ME.example.com/mcp";

export function buildKit(resource: DiscoveredResource, dist: DistributionFile | null): Kit {
  const app = dist?.apps[resource.name] ?? {};
  const slug = resource.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const name = app.name?.trim() || resource.name;
  const tagline = app.tagline?.trim() ?? "";
  const description = app.description?.trim() ?? "";
  const isMcp = isMcpResource(resource);
  const url = app.url?.trim() || URL_PLACEHOLDER;
  const version = app.version?.trim() || "0.1.0";
  const owner = dist?.owner?.trim() || "REPLACE-ME";
  const githubOwner = dist?.githubOwner?.trim() || "REPLACE-ME";
  const { tools, prompts } = readToolsAndPrompts(resource.path);
  const warnings: string[] = [];

  if (!tagline)
    warnings.push(`No tagline: add "tagline" for ${resource.name} in ${DISTRIBUTION_FILE}.`);
  else if (tagline.length > TAGLINE_LIMIT)
    warnings.push(`Tagline is ${tagline.length} characters; Product Hunt allows ${TAGLINE_LIMIT}.`);
  if (!description)
    warnings.push(
      `No description: add "description" for ${resource.name} in ${DISTRIBUTION_FILE}.`,
    );
  if (isMcp && url === URL_PLACEHOLDER)
    warnings.push(
      `No public URL: add "url" for ${resource.name} in ${DISTRIBUTION_FILE}, or replace ${URL_PLACEHOLDER} by hand.`,
    );
  if (isMcp && url !== URL_PLACEHOLDER && !url.startsWith("https://"))
    warnings.push(`The URL ${url} is not https; every channel needs a public https URL.`);
  const registryDescription = description || tagline || name;
  if (isMcp && registryDescription.length > REGISTRY_DESCRIPTION_LIMIT)
    warnings.push(
      `server.json description is ${registryDescription.length} characters; the MCP Registry allows ${REGISTRY_DESCRIPTION_LIMIT}. It was cut.`,
    );
  if (name.length > OPENAI_NAME_LIMIT)
    warnings.push(
      `Name is ${name.length} characters; OpenAI allows ${OPENAI_NAME_LIMIT} for displayName.`,
    );
  if (githubOwner === "REPLACE-ME" && isMcp)
    warnings.push(
      `No GitHub owner: add "githubOwner" to ${DISTRIBUTION_FILE} for the MCP Registry name.`,
    );

  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  const plugin: Record<string, unknown> = {
    name: slug,
    displayName: name,
    version,
    description: description || tagline || `REPLACE-ME: say what ${name} does`,
    author: { name: owner },
    ...(app.homepage ? { homepage: app.homepage } : {}),
    ...(app.repository ? { repository: app.repository } : {}),
    license: "MIT",
    keywords: [slug, ...(isMcp ? ["mcp"] : [])],
  };
  const files: KitFile[] = [{ path: ".claude-plugin/plugin.json", content: json(plugin) }];
  if (isMcp) {
    files.push({
      path: ".mcp.json",
      content: json({ mcpServers: { [slug]: { type: "http", url } } }),
    });
    files.push({
      path: "server.json",
      content: json({
        $schema: "https://static.modelcontextprotocol.io/schemas/2025-09-29/server.schema.json",
        name: `io.github.${githubOwner}/${slug}`,
        description: registryDescription.slice(0, REGISTRY_DESCRIPTION_LIMIT),
        version,
        ...(app.repository ? { repository: { url: app.repository, source: "github" } } : {}),
        remotes: [{ type: "streamable-http", url }],
      }),
    });
  }

  const bullets = (items: string[], empty: string) =>
    items.length > 0 ? items.map((i) => `- ${i}`).join("\n") : `- ${empty}`;
  const channelSection = CHANNELS.map((channel) => {
    const applies = !channel.isMcpOnly || isMcp;
    const entry = app.channels?.[channel.id];
    const status = entry?.status ?? (applies ? "todo" : "n/a");
    return [
      `### ${STATUS_ICONS[status]} ${channel.name}`,
      "",
      ...(applies
        ? channel.limits.map((l) => `- [ ] ${l}`)
        : ["- Not for this resource: it lists MCP servers only."]),
      ...(entry?.url ? [`- Link: ${entry.url}`] : []),
    ].join("\n");
  }).join("\n\n");

  const listing = [
    `# ${name}`,
    "",
    "This kit was written by `flisk distribute kit`. Nothing was submitted; fill in the gaps and submit each listing by hand.",
    "",
    "## Name",
    "",
    name,
    "",
    `## Tagline (at most ${TAGLINE_LIMIT} characters)`,
    "",
    tagline
      ? `${tagline} (${tagline.length} characters)`
      : "REPLACE-ME: one line people would type to find it.",
    "",
    "## Description",
    "",
    description || "REPLACE-ME: what it does, for whom, in two or three plain sentences.",
    "",
    "## Best for",
    "",
    bullets(app.bestFor ?? [], "REPLACE-ME: who gets the most out of it"),
    "",
    "## Tools",
    "",
    bullets(
      tools.map((t) => `\`${t}\``),
      isMcp ? "None found in the source; list them by hand." : "Not an MCP resource.",
    ),
    "",
    "## Prompts",
    "",
    bullets(
      prompts.map((p) => `\`${p}\``),
      isMcp ? "None found in the source; list them by hand." : "Not an MCP resource.",
    ),
    "",
    "## Reviewer notes",
    "",
    app.reviewerNotes?.trim() ||
      "REPLACE-ME: how a reviewer tries it (no account needed?), what it stores, and who to contact.",
    "",
    ...(isMcp
      ? ["## Server", "", `- URL: ${url}`, `- Health check: ${healthPath(resource)}`, ""]
      : []),
    "## Warnings",
    "",
    bullets(warnings, "None."),
    "",
    "## Channels",
    "",
    channelSection,
    "",
  ].join("\n");
  files.push({ path: "listing.md", content: listing });
  return { resource: resource.name, files, warnings };
}

/** Writes the kit under outDir. Refuses when any file exists, unless isForced. Returns the written paths. */
export function writeKit(kit: Kit, outDir: string, isForced: boolean): string[] {
  const targets = kit.files.map((f) => path.join(outDir, f.path));
  const existing = targets.filter((t) => fs.existsSync(t));
  if (existing.length > 0 && !isForced) {
    throw new FliskError(`The kit already exists: ${existing.join(", ")}`, [
      "Run again with --force to overwrite it",
      "Or pick another folder with --out <dir>",
    ]);
  }
  kit.files.forEach((file, i) => {
    const target = targets[i] as string;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  });
  return targets;
}
