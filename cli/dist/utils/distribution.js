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
import { FliskError } from "./errors.js";
export const DISTRIBUTION_FILE = "distribution.json";
export const CHANNEL_STATUSES = ["live", "review", "draft", "blocked", "todo", "n/a"];
export const STATUS_ICONS = {
    live: "✅",
    review: "⏳",
    draft: "🟡",
    blocked: "⛔",
    todo: "⬜",
    "n/a": "—",
};
export const CHANNELS = [
    {
        id: "claude-directory",
        name: "Claude directory (connector)",
        isMcpOnly: true,
        submit: "Form at claude.ai/directory/manage (10 steps); the owner ticks the checks and presses Submit.",
        limits: [
            "Remote https MCP servers only; a local stdio server cannot be a connector.",
            "The slug is permanent: it cannot change after you submit.",
            "One-liner at most 200 characters.",
            "Pick at most 5 categories (Development tools first).",
            "Every tool needs a title and read-only or destructive hints.",
            "Needs docs, support and privacy URLs and a square icon.",
            "Editing an approved listing sends it back to review.",
        ],
    },
    {
        id: "claude-plugin",
        name: "Claude plugin directory",
        isMcpOnly: false,
        submit: "Submit the GitHub folder that holds .claude-plugin/plugin.json; link it to its connector once that is approved.",
        limits: [
            "A folder in a public GitHub repo with .claude-plugin/plugin.json.",
            "plugin.json name is the slug (lowercase, dashes).",
            "Its .mcp.json and skills must match the connector it links to.",
        ],
    },
    {
        id: "toolradar",
        name: "Toolradar",
        isMcpOnly: false,
        submit: "Submit at toolradar.com/company/submit, or claim an existing profile at toolradar.com/claim?tool=<slug>.",
        limits: [
            "At most 2 submissions per hour.",
            "Tagline at most 60 characters.",
            "Needs a public website, category, pricing and a logo.",
            "A personal email triggers a domain confirmation; use a company address.",
        ],
    },
    {
        id: "product-hunt",
        name: "Product Hunt",
        isMcpOnly: false,
        submit: "Post by hand at producthunt.com/posts/new, in the owner's browser.",
        limits: [
            "Tagline at most 60 characters.",
            "Description at most 260 characters.",
            "Gallery images 1270x760 (up to 8); thumbnail at least 240x240.",
            "Video must be a YouTube or Loom link.",
        ],
    },
    {
        id: "mcp-registry",
        name: "Official MCP Registry",
        isMcpOnly: true,
        submit: "Publish server.json with mcp-publisher, signed in with GitHub; updates need a new version.",
        limits: [
            "Name io.github.<githubOwner>/<slug>; the GitHub login must own it.",
            "Description at most 100 characters.",
            "Every update needs a new version.",
        ],
    },
    {
        id: "glama",
        name: "Glama",
        isMcpOnly: true,
        submit: "Add glama.json to the repo root, claim the server on glama.ai, then make a release from a passing build test.",
        limits: [
            "Needs a public GitHub repository with a license.",
            "Glama builds a Dockerfile and checks the server answers the MCP handshake.",
            "Re-release after server changes so the score refreshes.",
        ],
    },
    {
        id: "smithery",
        name: "Smithery",
        isMcpOnly: true,
        submit: "Sign in at smithery.ai/new and point it at the repo; it reads smithery.yaml.",
        limits: ["Needs smithery.yaml in the repo.", "Needs a login; the owner signs in."],
    },
    {
        id: "mcp-so",
        name: "mcp.so",
        isMcpOnly: true,
        submit: "Submit the GitHub URL at mcp.so/submit (form only; its repo takes no PRs).",
        limits: ["Submit by link: the public GitHub URL.", "Needs a login."],
    },
    {
        id: "pulsemcp",
        name: "PulseMCP",
        isMcpOnly: true,
        submit: "Submit by link at pulsemcp.com; it also ingests the official MCP Registry.",
        limits: [
            "Submit by link.",
            "Submissions were paused on 2026-10-07; list on the MCP Registry instead.",
        ],
    },
    {
        id: "cursor-directory",
        name: "Cursor Directory",
        isMcpOnly: true,
        submit: "Submit the MCP server entry at cursor.directory, signed in.",
        limits: ["Needs a login.", "One entry per MCP server, with its install config."],
    },
    {
        id: "skills-sh",
        name: "skills.sh",
        isMcpOnly: false,
        submit: "Push a public GitHub repo of skills/<name>/SKILL.md; people install it with npx skills add <owner>/<repo>.",
        limits: [
            "Each skill is a SKILL.md with name and description front matter.",
            "Installs straight from GitHub; check npx skills add works.",
        ],
    },
    {
        id: "apify",
        name: "Apify Store",
        isMcpOnly: false,
        submit: "apify push from the Actor folder (apify login first), then set icon, SEO fields and categories and make it public.",
        limits: [
            "Needs an Actor (.actor/actor.json and a Dockerfile).",
            "Set icon, SEO title, SEO description and categories in the console.",
            "Store search lags about a day.",
        ],
    },
    {
        id: "docker-hub",
        name: "Docker Hub",
        isMcpOnly: false,
        submit: "docker push to the organization namespace; the owner creates the organization and picks the plan.",
        limits: [
            "Needs a container image.",
            "Push to the organization namespace, never a personal one.",
        ],
    },
    {
        id: "github-actions",
        name: "GitHub Actions Marketplace",
        isMcpOnly: false,
        submit: 'Edit the release, tick "Publish this Action to the GitHub Marketplace", pick two categories.',
        limits: [
            "One action.yml at the repository root.",
            "description under 125 characters, a unique name, and branding (icon and color).",
        ],
    },
    {
        id: "npm",
        name: "npm",
        isMcpOnly: false,
        submit: "npm publish from the package folder.",
        limits: ["Package name lowercase, at most 214 characters.", "Needs a README and a license."],
    },
    {
        id: "openai",
        name: "OpenAI (ChatGPT, Codex)",
        isMcpOnly: true,
        submit: "Upload a plugin ZIP (.codex-plugin/plugin.json, .mcp.json, skills, assets), verify the domain, fill the review details.",
        limits: [
            "Exactly one remote MCP server per plugin.",
            "displayName at most 30 characters.",
            "shortDescription at most 30 characters.",
            "longDescription at most 4000 characters.",
            "All URLs https; images square, at least 48 px, at most 5 MiB.",
            "No credentials, hooks or apps in the package.",
        ],
    },
    {
        id: "awesome-lists",
        name: "Awesome lists",
        isMcpOnly: false,
        submit: "One pull request per list, one at a time, disclosed as your own project.",
        limits: [
            "Submit by link: one list line per PR.",
            "Read and meet each list's own rules (stars, focus, activity) first.",
        ],
    },
];
export const TAGLINE_LIMIT = 60;
export const REGISTRY_DESCRIPTION_LIMIT = 100;
export const OPENAI_NAME_LIMIT = 30;
export const OPENAI_SHORT_DESCRIPTION_LIMIT = 30;
export const OPENAI_LONG_DESCRIPTION_LIMIT = 4000;
export const PRODUCT_HUNT_DESCRIPTION_LIMIT = 260;
export function isMcpResource(resource) {
    return resource.config?.appType === "mcp";
}
/** Reads distribution.json, or null when the project has none. Throws a FliskError when it is malformed. */
export function readDistributionFile(projectRoot) {
    const file = path.join(projectRoot, DISTRIBUTION_FILE);
    if (!fs.existsSync(file))
        return null;
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    }
    catch (err) {
        throw new FliskError(`${DISTRIBUTION_FILE} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`, ["Fix the file, or move it away and run flisk distribute status --init"]);
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new FliskError(`${DISTRIBUTION_FILE} must hold a JSON object`, [
            "Run flisk distribute status --init --force to write a fresh one",
        ]);
    }
    const data = parsed;
    const apps = data.apps ?? {};
    if (typeof apps !== "object" || Array.isArray(apps)) {
        throw new FliskError(`${DISTRIBUTION_FILE}: "apps" must be an object keyed by resource name`, [
            'Write it as { "apps": { "<resource>": { "channels": {} } } }',
        ]);
    }
    for (const [appName, app] of Object.entries(apps)) {
        if (typeof app !== "object" || app === null || Array.isArray(app)) {
            throw new FliskError(`${DISTRIBUTION_FILE}: app ${appName} must be an object`, [
                'Write it as { "channels": { "<channel>": { "status": "todo" } } }',
            ]);
        }
        const channels = app.channels ?? {};
        if (typeof channels !== "object" || channels === null || Array.isArray(channels)) {
            throw new FliskError(`${DISTRIBUTION_FILE}: ${appName} "channels" must be an object keyed by channel id`, [`Channel ids: ${CHANNELS.map((c) => c.id).join(", ")}`]);
        }
        for (const [channel, entry] of Object.entries(channels)) {
            if (!CHANNEL_STATUSES.includes(entry?.status)) {
                throw new FliskError(`${DISTRIBUTION_FILE}: ${appName} / ${channel} has status ${JSON.stringify(entry?.status)}`, [`Use one of: ${CHANNEL_STATUSES.join(", ")}`]);
            }
        }
    }
    return { ...data, schemaVersion: 1, apps };
}
/** Warnings about a distribution.json that loads but looks wrong, such as an unknown channel id. */
export function distributionWarnings(dist) {
    if (!dist)
        return [];
    const known = new Set(CHANNELS.map((c) => c.id));
    const warnings = [];
    for (const appName of Object.keys(dist.apps).sort()) {
        for (const id of Object.keys(dist.apps[appName]?.channels ?? {}).sort()) {
            if (!known.has(id)) {
                warnings.push(`${DISTRIBUTION_FILE}: ${appName} has unknown channel "${id}". Known channels: ${[...known].join(", ")}.`);
            }
        }
    }
    return warnings;
}
/** Adds the missing apps and channels to an existing distribution.json and keeps every entry already there. */
export function mergeDistribution(existing, resources) {
    const fresh = createInitialDistribution(resources);
    const apps = { ...existing.apps };
    for (const [name, freshApp] of Object.entries(fresh.apps)) {
        const old = apps[name];
        apps[name] = old
            ? { ...old, channels: { ...freshApp.channels, ...(old.channels ?? {}) } }
            : freshApp;
    }
    const sorted = Object.fromEntries(Object.keys(apps)
        .sort()
        .map((k) => [k, apps[k]]));
    return { ...existing, schemaVersion: 1, apps: sorted };
}
/** The empty distribution.json for these resources: every channel todo, MCP-only channels n/a for other types. */
export function createInitialDistribution(resources) {
    const apps = {};
    for (const resource of [...resources].sort((a, b) => a.name.localeCompare(b.name))) {
        const channels = {};
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
/** Zachman's six perspectives, top to bottom, each with the lifecycle stage it answers for. */
export const BOARD_ROWS = [
    { perspective: "Planner", view: "Scope", stage: "Idea" },
    { perspective: "Owner", view: "Business", stage: "Promise" },
    { perspective: "Designer", view: "System", stage: "Shape" },
    { perspective: "Builder", view: "Technology", stage: "Ship" },
    { perspective: "Subcontractor", view: "Component", stage: "Listed" },
    { perspective: "User", view: "Operations", stage: "Proof" },
];
export const BOARD_COLUMNS = ["What", "How", "Where", "Who", "When", "Why"];
const filled = (text) => ({ text, isMissing: false });
const missing = (text) => ({ text: `Missing: ${text}`, isMissing: true });
const orMissing = (value, hint) => value?.trim() ? filled(value.trim()) : missing(hint);
function listOr(values, hint) {
    return values.length > 0 ? filled(values.join(", ")) : missing(hint);
}
function healthPath(resource) {
    return resource.config?.healthCheckPath ?? "/health";
}
function channelName(id) {
    return CHANNELS.find((c) => c.id === id)?.name ?? id;
}
/**
 * The Zachman board. Rows are the six perspectives, columns the six questions. Every cell is read
 * from service.json or distribution.json; a cell with no data says what to add.
 */
export function buildBoard(resources, dist) {
    const sorted = [...resources].sort((a, b) => a.name.localeCompare(b.name));
    const apps = dist?.apps ?? {};
    const appOf = (name) => apps[name] ?? {};
    const mcp = sorted.filter(isMcpResource);
    const noDist = `no ${DISTRIBUTION_FILE}; run flisk distribute status --init`;
    const distHint = (field) => (dist ? `add "${field}" to ${DISTRIBUTION_FILE}` : noDist);
    const appHint = (field) => dist ? `add "${field}" to each app in ${DISTRIBUTION_FILE}` : noDist;
    const svcHint = (field) => `no resource sets "${field}" in service.json`;
    /** "app / channel" entries, sorted, with their channel entry. */
    const entries = Object.keys(apps)
        .sort()
        .flatMap((app) => Object.keys(apps[app]?.channels ?? {})
        .sort()
        .map((id) => ({ app, id, entry: apps[app]?.channels?.[id] })));
    const withStatus = (...statuses) => entries.filter((e) => statuses.includes(e.entry.status));
    const perApp = (pick) => sorted.flatMap((r) => {
        const value = pick(appOf(r.name))?.trim();
        return value ? [`${r.name}: ${value}`] : [];
    });
    const perResource = (pick) => sorted.flatMap((r) => {
        const value = pick(r);
        return value ? [`${r.name}: ${value}`] : [];
    });
    const latest = (list) => list
        .flatMap((e) => (e.entry.date ? [e.entry.date] : []))
        .sort()
        .at(-1);
    const countCell = (list, label, hint) => list.length > 0 ? filled(`${list.length} ${label}`) : missing(hint);
    const planned = [
        ...new Set(withStatus("live", "review", "draft", "blocked", "todo").map((e) => channelName(e.id))),
    ].sort();
    const listedWhere = [
        ...new Set(withStatus("live", "review").map((e) => channelName(e.id))),
    ].sort();
    const clients = [
        ...(mcp.length > 0 ? ["AI clients over MCP"] : []),
        ...(sorted.some((r) => r.config?.appType === "frontend") ? ["people in a browser"] : []),
        ...(sorted.some((r) => r.config?.appType === "backend") ? ["other services over HTTP"] : []),
        ...(sorted.some((r) => r.config?.appType === "agent") ? ["callers of an agent"] : []),
    ];
    const tools = mcp.flatMap((r) => readToolsAndPrompts(r.path).tools.map((t) => `${r.name}/${t}`));
    const prompts = mcp.flatMap((r) => readToolsAndPrompts(r.path).prompts.map((p) => `${r.name}/${p}`));
    const noted = (list) => list.flatMap((e) => (e.entry.note ? [`${e.app}/${e.id}: ${e.entry.note}`] : []));
    const rows = [
        // Planner / Scope
        [
            sorted.length > 0
                ? filled(`${sorted.length} ${sorted.length === 1 ? "resource" : "resources"}: ${sorted
                    .map((r) => `${r.name} (${r.config?.appType ?? "unknown"})`)
                    .join(", ")}`)
                : missing("no service.json found; create one with flisk resource <name>"),
            orMissing(dist?.promise, distHint("promise")),
            listOr(planned, dist ? "no channel is planned for any app" : noDist),
            orMissing(dist?.audience, distHint("audience")),
            orMissing(dist?.launch, distHint("launch")),
            orMissing(dist?.why, distHint("why")),
        ],
        // Owner / Business
        [
            listOr(perApp((a) => a.tagline), appHint("tagline")),
            listOr(perApp((a) => a.description), appHint("description")),
            listOr(perApp((a) => a.url ?? a.homepage), appHint("url")),
            orMissing(dist?.owner, distHint("owner")),
            listOr(perApp((a) => a.version), appHint("version")),
            listOr(perApp((a) => (a.bestFor ?? []).join("; ")), appHint("bestFor")),
        ],
        // Designer / System
        [
            listOr([...new Set(sorted.flatMap((r) => (r.config?.appType ? [r.config.appType] : [])))].sort(), svcHint("appType")),
            mcp.length > 0
                ? filled(`MCP routes: ${mcp.map((r) => `${r.name} ${r.config?.basePath ?? ""}/mcp`).join(", ")}`)
                : missing("no MCP resource; tools reach AI clients through one"),
            listOr(sorted.flatMap((r) => {
                const port = r.port ?? r.config?.port;
                return port ? [`${r.name}:${port}`] : [];
            }), svcHint("port")),
            listOr(clients, "no resource people or AI clients can reach"),
            listOr(perResource((r) => r.config?.dependsOn?.length ? `after ${r.config.dependsOn.join(", ")}` : undefined), svcHint("dependsOn")),
            listOr(perResource((r) => r.config?.healthCheckPath), svcHint("healthCheckPath")),
        ],
        // Builder / Technology
        [
            listOr(perResource((r) => r.config?.image ?? r.config?.dockerfile ?? r.config?.runtime), 'no resource sets "image", "dockerfile" or "runtime" in service.json'),
            listOr(perResource((r) => r.config?.command ?? r.config?.dev?.command), 'no resource sets "command" in service.json'),
            listOr(perApp((a) => a.repository), appHint("repository")),
            orMissing(dist?.githubOwner, distHint("githubOwner")),
            orMissing(dist?.release, distHint("release")),
            orMissing(dist?.license, distHint("license")),
        ],
        // Subcontractor / Component
        [
            listOr(tools, mcp.length > 0 ? "no tools found in the MCP source" : "no MCP resource"),
            listOr(prompts, mcp.length > 0 ? "no prompts found in the MCP source" : "no MCP resource"),
            listOr(listedWhere, dist ? "no channel is live or in review" : noDist),
            listOr(perApp((a) => a.reviewerNotes), appHint("reviewerNotes")),
            orMissing(latest(entries), dist ? "no dates in the channel entries" : noDist),
            listOr(noted(withStatus("blocked")), dist ? "no blocked channel with a note" : noDist),
        ],
        // User / Operations
        [
            countCell(withStatus("live"), "live listings", dist ? "no live listing yet" : noDist),
            countCell(withStatus("review"), "in review", dist ? "no listing in review" : noDist),
            listOr(withStatus("live").flatMap((e) => (e.entry.url ? [e.entry.url] : [])), dist ? "no url on a live channel entry" : noDist),
            orMissing(dist?.support, distHint("support")),
            orMissing(latest(withStatus("live")), dist ? "no date on a live channel entry" : noDist),
            listOr(noted(withStatus("live")), dist ? "no note on a live channel entry" : noDist),
        ],
    ];
    return {
        rows: BOARD_ROWS.map((r, i) => ({
            ...r,
            cells: Object.fromEntries(BOARD_COLUMNS.map((c, j) => [c, rows[i][j]])),
        })),
    };
}
export function formatBoard(board) {
    const lines = [
        "Zachman board: rows are the six perspectives, columns the six questions",
        "",
    ];
    for (const { perspective, view, stage, cells } of board.rows) {
        lines.push(`${perspective} / ${view}  (stage: ${stage})`);
        for (const column of BOARD_COLUMNS) {
            const cell = cells[column];
            lines.push(`  ${column.padEnd(6)} ${cell.isMissing ? "⬜" : "✅"} ${cell.text}`);
        }
        lines.push("");
    }
    return lines.join("\n");
}
export function buildStatusGrid(dist) {
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
            cells: Object.fromEntries(apps.map((app) => [
                app,
                dist.apps[app]?.channels?.[channel.id] ?? { status: "todo" },
            ])),
        })),
    };
}
export function formatStatusGrid(grid) {
    const legend = CHANNEL_STATUSES.map((s) => `${STATUS_ICONS[s]} ${s}`).join(" · ");
    const header = ["Channel", ...grid.apps];
    const rows = grid.channels.map((c) => [
        c.name,
        ...grid.apps.map((app) => STATUS_ICONS[c.cells[app].status]),
    ]);
    const lines = [
        legend,
        "",
        `| ${header.join(" | ")} |`,
        `| ${header.map(() => "---").join(" | ")} |`,
    ];
    for (const r of rows)
        lines.push(`| ${r.join(" | ")} |`);
    return lines.join("\n");
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
function listSourceFiles(dir, out = [], depth = 0) {
    if (depth > 6 || !fs.existsSync(dir))
        return out;
    for (const entry of fs
        .readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name))
                listSourceFiles(full, out, depth + 1);
        }
        else if (SOURCE_EXTENSIONS.has(path.extname(entry.name)) && !entry.name.includes(".test.")) {
            out.push(full);
        }
    }
    return out;
}
/**
 * Tool and prompt names a resource registers, read from its source: registerTool("x"),
 * registerTool({ name: "x" }), server.tool("x") or mcp.tool("x") on an MCP server object, and
 * Python @mcp.tool / @mcp.tool(...) decorators. A .tool("x") call on any other object is not counted.
 */
export function readToolsAndPrompts(resourceDir) {
    const tools = new Set();
    const prompts = new Set();
    const patterns = (kind, short) => [
        new RegExp(`\\bregister${kind}\\(\\s*["'\`]([\\w.-]+)["'\`]`, "g"),
        new RegExp(`\\bregister${kind}\\(\\s*\\{[^}]*?\\bname\\s*:\\s*["'\`]([\\w.-]+)["'\`]`, "g"),
        new RegExp(`\\b(?:server|mcp|mcpServer|mcp_server)\\.${short}\\(\\s*["'\`]([\\w.-]+)["'\`]`, "g"),
        new RegExp(`@\\w+\\.${short}\\b(?:\\([^)]*\\))?\\s*\\n\\s*(?:async\\s+)?def\\s+(\\w+)`, "g"),
    ];
    const toolPatterns = patterns("Tool", "tool");
    const promptPatterns = patterns("Prompt", "prompt");
    for (const file of listSourceFiles(resourceDir)) {
        const text = fs.readFileSync(file, "utf-8");
        for (const re of toolPatterns)
            for (const m of text.matchAll(re))
                tools.add(m[1]);
        for (const re of promptPatterns)
            for (const m of text.matchAll(re))
                prompts.add(m[1]);
    }
    return { tools: [...tools].sort(), prompts: [...prompts].sort() };
}
export const URL_PLACEHOLDER = "https://REPLACE-ME.example.com/mcp";
/** A listing slug: lowercase letters, digits and single dashes. */
export function slugify(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
export function buildKit(resource, dist) {
    const app = dist?.apps[resource.name] ?? {};
    const slug = slugify(resource.name) || "app";
    const name = app.name?.trim() || resource.name;
    const tagline = app.tagline?.trim() ?? "";
    const description = app.description?.trim() ?? "";
    const isMcp = isMcpResource(resource);
    const url = app.url?.trim() || URL_PLACEHOLDER;
    const version = app.version?.trim() || "0.1.0";
    const owner = dist?.owner?.trim() || "REPLACE-ME";
    const githubOwner = dist?.githubOwner?.trim() || "REPLACE-ME";
    const { tools, prompts } = isMcp
        ? readToolsAndPrompts(resource.path)
        : { tools: [], prompts: [] };
    const warnings = [];
    if (!tagline)
        warnings.push(`No tagline: add "tagline" for ${resource.name} in ${DISTRIBUTION_FILE}.`);
    else {
        if (tagline.length > TAGLINE_LIMIT)
            warnings.push(`Tagline is ${tagline.length} characters; Product Hunt and Toolradar allow ${TAGLINE_LIMIT}.`);
        if (isMcp && tagline.length > OPENAI_SHORT_DESCRIPTION_LIMIT)
            warnings.push(`Tagline is ${tagline.length} characters; OpenAI allows ${OPENAI_SHORT_DESCRIPTION_LIMIT} for shortDescription.`);
    }
    if (description.length > PRODUCT_HUNT_DESCRIPTION_LIMIT)
        warnings.push(`Description is ${description.length} characters; Product Hunt allows ${PRODUCT_HUNT_DESCRIPTION_LIMIT}.`);
    if (isMcp && description.length > OPENAI_LONG_DESCRIPTION_LIMIT)
        warnings.push(`Description is ${description.length} characters; OpenAI allows ${OPENAI_LONG_DESCRIPTION_LIMIT} for longDescription.`);
    if (!description)
        warnings.push(`No description: add "description" for ${resource.name} in ${DISTRIBUTION_FILE}.`);
    if (isMcp && url === URL_PLACEHOLDER)
        warnings.push(`No public URL: add "url" for ${resource.name} in ${DISTRIBUTION_FILE}, or replace ${URL_PLACEHOLDER} by hand.`);
    if (isMcp && url !== URL_PLACEHOLDER && !url.startsWith("https://"))
        warnings.push(`The URL ${url} is not https; every channel needs a public https URL.`);
    const registryDescription = description || tagline || name;
    if (isMcp && registryDescription.length > REGISTRY_DESCRIPTION_LIMIT)
        warnings.push(`server.json description is ${registryDescription.length} characters; the MCP Registry allows ${REGISTRY_DESCRIPTION_LIMIT}. It was cut.`);
    if (isMcp && name.length > OPENAI_NAME_LIMIT)
        warnings.push(`Name is ${name.length} characters; OpenAI allows ${OPENAI_NAME_LIMIT} for displayName.`);
    if (githubOwner === "REPLACE-ME" && isMcp)
        warnings.push(`No GitHub owner: add "githubOwner" to ${DISTRIBUTION_FILE}; the MCP Registry name is io.github.<githubOwner>/${slug}.`);
    if (owner === "REPLACE-ME")
        warnings.push(`No owner: add "owner" to ${DISTRIBUTION_FILE} for the plugin author.`);
    const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
    const plugin = {
        name: slug,
        displayName: name,
        version,
        description: description || tagline || `REPLACE-ME: say what ${name} does`,
        author: { name: owner },
        ...(app.homepage ? { homepage: app.homepage } : {}),
        ...(app.repository ? { repository: app.repository } : {}),
        license: dist?.license?.trim() || "MIT",
        keywords: [slug, ...(isMcp ? ["mcp"] : [])],
    };
    const files = [{ path: ".claude-plugin/plugin.json", content: json(plugin) }];
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
    const bullets = (items, empty) => items.length > 0 ? items.map((i) => `- ${i}`).join("\n") : `- ${empty}`;
    const channelSection = CHANNELS.map((channel) => {
        const applies = !channel.isMcpOnly || isMcp;
        const entry = app.channels?.[channel.id];
        const status = entry?.status ?? (applies ? "todo" : "n/a");
        return [
            `### ${STATUS_ICONS[status]} ${channel.name}`,
            "",
            ...(applies ? [`How to submit: ${channel.submit}`, ""] : []),
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
        bullets(tools.map((t) => `\`${t}\``), isMcp ? "None found in the source; list them by hand." : "Not an MCP resource."),
        "",
        "## Prompts",
        "",
        bullets(prompts.map((p) => `\`${p}\``), isMcp ? "None found in the source; list them by hand." : "Not an MCP resource."),
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
export function writeKit(kit, outDir, isForced) {
    const targets = kit.files.map((f) => path.join(outDir, f.path));
    const existing = targets.filter((t) => fs.existsSync(t));
    if (existing.length > 0 && !isForced) {
        throw new FliskError(`The kit already exists: ${existing.join(", ")}`, [
            "Run again with --force to overwrite it",
            "Or pick another folder with --out <dir>",
        ]);
    }
    kit.files.forEach((file, i) => {
        const target = targets[i];
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, file.content);
    });
    return targets;
}
