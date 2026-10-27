// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Writes the five Product Hunt gallery cards for "Flisk for AI agents" as 1270x760 SVG next to this file.
// Run: bun docs/launch/flisk-for-agents/gallery/build.mjs
// Render PNG files (macOS, Chrome): see ../README.md, "Gallery".
// Every command and every line of tool output below exists: the commands are the documented ones in
// docs/agent-tooling/flisk-mcp-setup.md, and the transcript text is copied from a real run (see TRANSCRIPT).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const W = 1270;
const H = 760;

// The per-host connect commands shown on card 2. When the one-command connect lands on main, replace these rows
// with it and change CONNECT_TITLE; until then they are the commands that work today.
const CONNECT_TITLE = "Connect your agent to Flisk";
const CONNECT = [
	{ host: "Claude Code", lines: ["claude mcp add --scope local --transport stdio flisk -- flisk mcp"] },
	{ host: "Codex", lines: ["codex mcp add flisk -- flisk mcp"] },
	{
		host: "Cursor",
		lines: [
			"# .cursor/mcp.json, under mcpServers",
			'"flisk": { "type": "stdio", "command": "sh",',
			'  "args": ["-c", "cd \\"${workspaceFolder}\\" && exec flisk mcp"] }',
		],
	},
	{ host: "Skills", lines: ["npx skills add flisk-sh/flisk-skills"] },
];

// The 19 tools of `flisk mcp` (cli/src/mcp/tools.ts), grouped by what the agent does with them.
const TOOL_GROUPS = [
	{ label: "Build", tools: ["project_init", "resource_create", "stack_assign", "config_regenerate"] },
	{ label: "Run", tools: ["up", "down", "restart_resource"] },
	{ label: "Check", tools: ["doctor", "config_verify", "config_explain", "runtime_check", "project_info"] },
	{ label: "Observe", tools: ["status", "logs", "network_list", "resource_list", "stack_list"] },
	{ label: "Agents", tools: ["list_agents", "get_agent_sessions"] },
];

// Agent transcript. Tool calls went over stdio to `flisk mcp` from the CLI built from main (1.4.7) on macOS (Colima,
// Tilt v0.37.8) on 2026-10-27; output is trimmed to the lines shown and joined with " · ", never reworded. The doctor
// line comes from the same call in a second scratch project with the same two services. The prompt and the closing
// sentence are the agent's side of the conversation, not tool output. status returned ready: false with pending
// resources several times before ready: true; those polls are cut here.
const TRANSCRIPT = [
	{ kind: "prompt", text: "Build a small shop: a storefront and an orders API. Start it and check it." },
	{ kind: "call", text: "flisk · project_init" },
	{ kind: "out", text: "✓ Created: .flisk/project.json" },
	{ kind: "out", text: "✓ Added agent skills: .claude/skills, .agents/skills and AGENTS.md (start with flisk-build)" },
	{ kind: "call", text: 'flisk · resource_create  name: "orders-api", type: "backend", stack: "shop"' },
	{ kind: "out", text: "✅ Resource created successfully!  ·  Port: 4000  ·  Path: services/shop/orders-api" },
	{ kind: "call", text: 'flisk · resource_create  name: "shop-web", type: "frontend", stack: "shop"' },
	{ kind: "out", text: "✅ Resource created successfully!  ·  Port: 3000  ·  Path: services/shop/shop-web" },
	{ kind: "call", text: "flisk · doctor" },
	{ kind: "out", text: '"ready": true  ·  Docker daemon is running  ·  Tilt v0.37.8, built 2026-10-01 is available' },
	{ kind: "call", text: 'flisk · up  stack: "shop"' },
	{ kind: "out", text: '"ok": true, "started": true' },
	{ kind: "out", text: '"next": "Poll the status tool until data.tilt.readiness.ready is true. ..."' },
	{ kind: "call", text: "flisk · status" },
	{ kind: "out", text: '"readiness": { "ready": true, "failures": [], "pending": 0 }  ·  "healthyCount": 2' },
	{ kind: "out", text: "shop-web: ready  ·  orders-api: ready" },
	{ kind: "say", text: "Both services are ready. Storefront: http://app.shop.localhost:8081/shop-web" },
];

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "'JetBrains Mono','Hack',ui-monospace,Menlo,monospace";

// One pass over the four characters SVG text and attributes need escaped, so an "&" from one entity is never escaped twice.
const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ENTITIES[c]);

function frame(title, body) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#101827"/><stop offset="1" stop-color="#192b3d"/></linearGradient>
<linearGradient id="glow" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#61f0d3"/><stop offset="1" stop-color="#69a8ff"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<text x="64" y="76" font-family="${SANS}" font-size="16" font-weight="700" letter-spacing="3" fill="#91a8bf">FLISK FOR AI AGENTS</text>
<rect x="64" y="90" width="72" height="4" rx="2" fill="url(#glow)"/>
${body}
<text x="64" y="${H - 20}" font-family="${SANS}" font-size="16" fill="#91a8bf">github.com/flisk-sh/flisk · MIT · runs on your machine</text>
</svg>
`;
}

const text = (x, y, s, { size = 20, weight = 400, fill = "#edf5ff", font = SANS, anchor = "start" } = {}) =>
	`<text x="${x}" y="${y}" xml:space="preserve" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;

const card = (x, y, w, h, extra = "") =>
	`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="#111d2b" stroke="#2d4358" stroke-width="1.5" ${extra}/>`;

function titleCard(tagline) {
	const hosts = ["Claude Code", "Cursor", "Codex"];
	let x = 64;
	const pills = hosts
		.map((h) => {
			const w = h.length * 12 + 44;
			const out = `<rect x="${x}" y="470" width="${w}" height="52" rx="26" fill="#153040" stroke="#315469"/>${text(x + w / 2, 503, h, { size: 21, weight: 600, anchor: "middle" })}`;
			x += w + 16;
			return out;
		})
		.join("\n");
	return frame(
		`Flisk for AI agents: ${tagline}`,
		`${text(64, 250, "Flisk for AI agents", { size: 76, weight: 750 })}
${text(64, 330, tagline, { size: 38, weight: 500, fill: "#cfe3f7" })}
${text(64, 400, "The flisk mcp server (19 tools) plus the Flisk skills, for the agent you already use.", { size: 24, fill: "#91a8bf" })}
${pills}
${text(64, 610, "Scaffold · start · check · read logs · fix", { size: 26, weight: 600, fill: "#61f0d3" })}`,
	);
}

function connectCard() {
	const rowH = (r) => 40 + r.lines.length * 32;
	let y = 160;
	const rows = CONNECT.map((r) => {
		const h = rowH(r);
		const out = `${card(64, y, W - 128, h)}
${text(96, y + 44, r.host, { size: 22, weight: 700, fill: "#61f0d3" })}
${r.lines.map((l, i) => text(280, y + 44 + i * 32, l, { size: 19, font: MONO, fill: "#edf5ff" })).join("\n")}`;
		y += h + 22;
		return out;
	}).join("\n");
	return frame(
		CONNECT_TITLE,
		`${text(64, 140, CONNECT_TITLE, { size: 44, weight: 750 })}
${rows}
${text(64, y + 28, "Install first: npm install -g @flisk-sh/flisk  (or curl -fsSL https://flisk.sh/install.sh | sh)", { size: 19, fill: "#91a8bf" })}`,
	);
}

function toolsCard() {
	const colW = (W - 128 - 4 * 20) / 5;
	const cols = TOOL_GROUPS.map((g, i) => {
		const x = 64 + i * (colW + 20);
		return `${card(x, 200, colW, 420)}
${text(x + 24, 246, g.label, { size: 24, weight: 700, fill: "#61f0d3" })}
<rect x="${x + 24}" y="260" width="40" height="3" rx="1.5" fill="url(#glow)"/>
${g.tools.map((t, j) => text(x + 20, 310 + j * 56, t, { size: 16, font: MONO })).join("\n")}`;
	}).join("\n");
	return frame(
		"What your agent can do: the 19 tools of flisk mcp",
		`${text(64, 140, "What your agent can do", { size: 44, weight: 750 })}
${text(64, 178, "The 19 tools of flisk mcp, called by Claude Code, Cursor or Codex.", { size: 22, fill: "#91a8bf" })}
${cols}
${text(64, 666, "Each tool runs the Flisk CLI on your machine and returns its JSON or text output.", { size: 20, fill: "#cfe3f7" })}`,
	);
}

function transcriptCard() {
	const x0 = 64;
	const y0 = 110;
	const w = W - 128;
	const h = 520;
	let y = y0 + 72;
	const lines = TRANSCRIPT.map((l) => {
		const t = l.text;
		let out;
		if (l.kind === "prompt") {
			out = `${text(x0 + 28, y, ">", { size: 19, font: MONO, fill: "#d97757", weight: 700 })}${text(x0 + 52, y, t, { size: 19, font: MONO, fill: "#edf5ff" })}`;
			y += 40;
		} else if (l.kind === "call") {
			out = `${text(x0 + 28, y, "⏺", { size: 17, font: MONO, fill: "#4eba65" })}${text(x0 + 56, y, t, { size: 18, font: MONO, fill: "#edf5ff", weight: 600 })}`;
			y += 26;
		} else if (l.kind === "out") {
			out = `${text(x0 + 56, y, "⎿", { size: 17, font: MONO, fill: "#5c6b7c" })}${text(x0 + 84, y, t, { size: 16, font: MONO, fill: "#91a8bf" })}`;
			y += 24;
		} else {
			y += 6;
			out = `${text(x0 + 28, y, "⏺", { size: 17, font: MONO, fill: "#edf5ff" })}${text(x0 + 56, y, t, { size: 18, font: SANS, fill: "#edf5ff" })}`;
			y += 27;
		}
		return out;
	}).join("\n");
	return frame(
		"An AI agent builds and starts a two-service stack with the Flisk MCP tools",
		`<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="14" fill="#0f0f10" stroke="#2d4358" stroke-width="1.5"/>
<rect x="${x0}" y="${y0}" width="${w}" height="40" rx="14" fill="#18181a"/>
<rect x="${x0}" y="${y0 + 26}" width="${w}" height="14" fill="#18181a"/>
<circle cx="${x0 + 24}" cy="${y0 + 20}" r="6.5" fill="#ff5f57"/><circle cx="${x0 + 46}" cy="${y0 + 20}" r="6.5" fill="#febc2e"/><circle cx="${x0 + 68}" cy="${y0 + 20}" r="6.5" fill="#28c840"/>
${text(x0 + w / 2, y0 + 26, "coding agent · ~/shop · flisk mcp", { size: 15, fill: "#8b8b90", anchor: "middle" })}
${lines}
${text(64, y0 + h + 26, "Tool calls and output from a real run, trimmed to these lines. Ports depend on what is free on the machine.", { size: 17, fill: "#91a8bf" })}`,
	);
}

function closingCard() {
	const items = [
		["Free", "The core CLI and flisk mcp are MIT. No key, no account."],
		["Local", "Runs on your machine on Docker and Tilt. Not a hosted service, not a deploy tool."],
		["Yours", "Plain service.json per service. Generated files you can read; flisk eject removes them."],
	];
	const blocks = items
		.map(([k, v], i) => {
			const y = 250 + i * 120;
			return `${card(64, y, W - 128, 96)}
${text(100, y + 60, k, { size: 34, weight: 750, fill: "#61f0d3" })}
${text(280, y + 59, v, { size: 24, fill: "#edf5ff" })}`;
		})
		.join("\n");
	return frame(
		"Flisk for AI agents: free, local, MIT",
		`${text(64, 170, "Free, local, MIT", { size: 64, weight: 750 })}
${blocks}
${text(64, 650, "npm install -g @flisk-sh/flisk", { size: 26, font: MONO, fill: "#cfe3f7" })}`,
	);
}

export const TAGLINE = "Let your coding agent build and run your local stack";

export function build() {
	return {
		"01-title.svg": titleCard(TAGLINE),
		"02-connect.svg": connectCard(),
		"03-agent-tools.svg": toolsCard(),
		"04-transcript.svg": transcriptCard(),
		"05-free-local-mit.svg": closingCard(),
	};
}

if (import.meta.main ?? process.argv[1] === fileURLToPath(import.meta.url)) {
	
	for (const [name, svg] of Object.entries(build())) writeFileSync(path.join(here, name), svg);
	console.log("wrote 5 cards to", here);
}
