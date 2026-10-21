// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
// Draws two SVG maps from the issue labels: one island per "island: ..." label, one dot per quest (issue).
//   docs/journey/map.svg           every quest, the contributor journey
//   docs/journey/hacktoberfest.svg only quests labelled `hacktoberfest`, with a countdown
// A filled dot is a closed issue, a hollow dot is an open one. `tracking` issues are skipped. Needs the `gh` CLI.
// Run: node scripts/journey-map.mjs [owner/repo]
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const repo = process.argv[2] ?? "flisk-sh/tdk-cli-core";
const outFile = (name) => new URL(`../docs/journey/${name}`, import.meta.url);

// Listed in the order the dotted route visits them (a snake, four per row, the flag takes the first slot).
const ISLANDS = [
  { label: "island: CLI Cove", name: "CLI Cove", icon: "🏝️", color: "#1d76db" },
  { label: "island: Docs Harbor", name: "Docs Harbor", icon: "⚓", color: "#0075ca" },
  { label: "island: UI Lagoon", name: "UI Lagoon", icon: "🌊", color: "#8a63d2" },
  { label: "island: Doctor Reef", name: "Doctor Reef", icon: "🪸", color: "#0e8a16" },
  { label: "island: Test Atoll", name: "Test Atoll", icon: "🧪", color: "#d4a72c" },
  { label: "island: Launch Port", name: "Launch Port", icon: "🚢", color: "#2496ed" },
  { label: "island: Growth Bay", name: "Growth Bay", icon: "🌱", color: "#c9a100" },
  {
    label: "island: Recipe Archipelago",
    name: "Recipe Archipelago",
    icon: "🧩",
    color: "#5319e7",
  },
  { label: "island: Perf Peak", name: "Perf Peak", icon: "⚡", color: "#b60205" },
  { label: "island: Agent Isle", name: "Agent Isle", icon: "🤖", color: "#006b75" },
  { label: "island: Engine Volcano", name: "Engine Volcano", icon: "🌋", color: "#e36209" },
];
const RANKS = [
  ["8 kyu", "🌱"],
  ["7 kyu", "🌿"],
  ["6 kyu", "🪵"],
  ["5 kyu", "⚓"],
  ["4 kyu", "🧭"],
  ["1 dan", "🏔️"],
];

const COLS = 4;
const W = 1040;
const MAX_DOTS = 24; // two rows of 12; bigger islands draw a proportional dot count

const THEMES = {
  journey: {
    bg: ["#bfe6ff", "#6bb7e8"],
    text: "#12304a",
    route: "#fff",
    sand: "#f4e3b0",
    grass: "#9bd68a",
    ladderFill: "#fff",
  },
  hacktoberfest: {
    bg: ["#1b1035", "#8a3b12"],
    text: "#fff4e0",
    route: "#ffb347",
    sand: "#f4e3b0",
    grass: "#9bd68a",
    ladderFill: "#2a1750",
  },
};

const rankOf = (issue) =>
  RANKS.find(([r]) => issue.labels.some((l) => l.name === `rank: ${r}`))?.[0] ?? null;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function allIssues() {
  const json = execFileSync(
    "gh",
    [
      "issue",
      "list",
      "-R",
      repo,
      "--state",
      "all",
      "--limit",
      "1000",
      "--json",
      "number,state,labels",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(json).filter((i) => !i.labels.some((l) => l.name === "tracking"));
}

function slot(n, y0) {
  const row = Math.floor(n / COLS);
  const col = row % 2 === 0 ? n % COLS : COLS - 1 - (n % COLS);
  return { x: 150 + col * 247, y: y0 + row * 210, row };
}

function dots(isl, quests, theme) {
  const n = quests.length;
  const shown = Math.min(n, MAX_DOTS);
  const done = quests.filter((i) => i.state === "CLOSED").length;
  const filled = n <= MAX_DOTS ? done : Math.round((done / n) * MAX_DOTS);
  let out = "";
  for (let k = 0; k < shown; k++) {
    const cx = isl.x - 82 + (k % 12) * 15;
    const cy = isl.y + 96 + Math.floor(k / 12) * 15;
    out +=
      k < filled
        ? `<circle cx="${cx}" cy="${cy}" r="6" fill="${isl.color}" stroke="${theme.sand}" stroke-width="1"/>`
        : `<circle cx="${cx}" cy="${cy}" r="5.5" fill="none" stroke="${isl.color}" stroke-width="2"/>`;
  }
  return out;
}

function draw({ file, theme, title, subtitle, islands, ladderTitle, ladderCounts, aria, footer }) {
  const y0 = 190;
  const placed = islands.map((isl, n) => ({ ...isl, ...slot(n + 1, y0) }));
  const flag = slot(0, y0);
  const stops = [flag, ...placed];

  // Straight legs along a row; when the route drops to the next row it bows out past the island column.
  let path = `M${flag.x},${flag.y - 10}`;
  for (let k = 1; k < stops.length; k++) {
    const a = stops[k - 1];
    const b = stops[k];
    if (a.row === b.row) {
      path += ` L${b.x},${b.y}`;
    } else {
      const side = a.row % 2 === 0 ? 145 : -145;
      path += ` C${a.x + side},${a.y + 30} ${b.x + side},${b.y - 30} ${b.x},${b.y}`;
    }
  }

  let svgIslands = "";
  for (const isl of placed) {
    const done = isl.quests.filter((i) => i.state === "CLOSED").length;
    const note = isl.quests.length > MAX_DOTS ? ` · 1 dot ≈ ${Math.ceil(isl.quests.length / MAX_DOTS)}` : "";
    svgIslands += `
  <g>
    <ellipse cx="${isl.x}" cy="${isl.y + 7}" rx="96" ry="54" fill="#000" opacity=".10"/>
    <ellipse cx="${isl.x}" cy="${isl.y}" rx="94" ry="52" fill="${theme.sand}" stroke="${isl.color}" stroke-width="3"/>
    <ellipse cx="${isl.x}" cy="${isl.y - 6}" rx="66" ry="32" fill="${theme.grass}" opacity=".85"/>
    <text x="${isl.x}" y="${isl.y + 14}" font-size="46" text-anchor="middle">${isl.icon}</text>
    <text x="${isl.x}" y="${isl.y + 82}" font-size="21" font-weight="700" text-anchor="middle" fill="${theme.text}">${esc(isl.name)}</text>
    ${dots(isl, isl.quests, theme)}
    <text x="${isl.x}" y="${isl.y + 136}" font-size="16" text-anchor="middle" fill="${theme.text}">${done}/${isl.quests.length} done${note}</text>
  </g>`;
  }

  const rows = Math.ceil(stops.length / COLS);
  const ladderY = y0 + rows * 210 + 10;
  const ladder = RANKS.map(
    ([r, icon], n) =>
      `<g><circle cx="${150 + n * 148}" cy="${ladderY + 50}" r="27" fill="${theme.ladderFill}" stroke="${theme.text}" stroke-width="2"/><text x="${150 + n * 148}" y="${ladderY + 59}" font-size="26" text-anchor="middle">${icon}</text><text x="${150 + n * 148}" y="${ladderY + 102}" font-size="18" font-weight="700" text-anchor="middle" fill="${theme.text}">${r}</text><text x="${150 + n * 148}" y="${ladderY + 124}" font-size="15" text-anchor="middle" fill="${theme.text}">${ladderCounts[r]}</text></g>`,
  ).join("");
  const H = ladderY + 170;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(aria)}">
  <defs><linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${theme.bg[0]}"/><stop offset="1" stop-color="${theme.bg[1]}"/></linearGradient></defs>
  <rect width="${W}" height="${H}" rx="18" fill="url(#sea)"/>
  <text x="${W / 2}" y="52" font-size="36" font-weight="800" text-anchor="middle" fill="${theme.text}">${esc(title)}</text>
  <text x="${W / 2}" y="84" font-size="19" text-anchor="middle" fill="${theme.text}">${esc(subtitle)}</text>
  <path d="${path}" fill="none" stroke="${theme.route}" stroke-width="4" stroke-dasharray="4 11" stroke-linecap="round"/>
  <text x="${flag.x}" y="${flag.y - 4}" font-size="46" text-anchor="middle">🚩</text>
  <text x="${flag.x}" y="${flag.y + 34}" font-size="20" font-weight="700" text-anchor="middle" fill="${theme.text}">Start here</text>
  ${svgIslands}
  <text x="${W / 2}" y="${ladderY - 14}" font-size="22" font-weight="700" text-anchor="middle" fill="${theme.text}">${esc(ladderTitle)}</text>
  <line x1="150" y1="${ladderY + 50}" x2="${150 + 5 * 148}" y2="${ladderY + 50}" stroke="${theme.text}" stroke-width="2" stroke-dasharray="4 6"/>
  ${ladder}
  <text x="${W / 2}" y="${H - 18}" font-size="15" text-anchor="middle" fill="${theme.text}">${esc(footer)}</text>
</svg>
`;
  writeFileSync(outFile(file), svg);
}

const issues = allIssues();
const countRanks = (list, open) =>
  Object.fromEntries(
    RANKS.map(([r]) => [
      r,
      `${list.filter((i) => rankOf(i) === r && (!open || i.state === "OPEN")).length} ${open ? "open" : "quests"}`,
    ]),
  );
const unranked = (list, open) => {
  const n = list.filter((i) => rankOf(i) === null && (!open || i.state === "OPEN")).length;
  return n > 0 ? ` · ${n} not ranked yet` : "";
};
const byIsland = (list) =>
  ISLANDS.map((isl) => ({ ...isl, quests: list.filter((i) => i.labels.some((l) => l.name === isl.label)) }));

// 1. The journey: every quest.
{
  const islands = byIsland(issues);
  const total = islands.reduce((s, i) => s + i.quests.length, 0);
  const done = islands.reduce((s, i) => s + i.quests.filter((q) => q.state === "CLOSED").length, 0);
  draw({
    file: "map.svg",
    theme: THEMES.journey,
    title: "🗺️ The TDK Journey",
    subtitle: `Filled dot = merged, hollow dot = open · ${done}/${total} quests done`,
    islands,
    ladderTitle: `Your rank ladder (Codewars style)${unranked(issues, false)}`,
    ladderCounts: countRanks(issues, false),
    aria: `TDK contributor journey map: ${done} of ${total} quests done across ${islands.length} islands`,
    footer: "Refreshed daily from the issue labels",
  });
  console.log(`wrote docs/journey/map.svg (${done}/${total} quests done)`);
}

// 2. Hacktoberfest: only quests labelled `hacktoberfest`, and only islands that have some.
{
  const fest = issues.filter((i) => i.labels.some((l) => l.name === "hacktoberfest"));
  const islands = byIsland(fest).filter((i) => i.quests.length > 0);
  const total = fest.length;
  const done = fest.filter((q) => q.state === "CLOSED").length;
  const now = new Date();
  const end = Date.UTC(now.getUTCFullYear(), 9, 31, 23, 59, 59);
  const start = Date.UTC(now.getUTCFullYear(), 9, 1);
  const days = Math.ceil((end - now.getTime()) / 864e5);
  const clock =
    now.getTime() < start
      ? "starts 1 October"
      : days >= 0
        ? `${days} day${days === 1 ? "" : "s"} left`
        : "see you next October";
  draw({
    file: "hacktoberfest.svg",
    theme: THEMES.hacktoberfest,
    title: `🎃 TDK Hacktoberfest ${now.getUTCFullYear()}`,
    subtitle: `${total - done} open quests · ${done} merged · ${clock}`,
    islands,
    ladderTitle: `Open quests by rank, start on the left${unranked(fest, true)}`,
    ladderCounts: countRanks(fest, true),
    aria: `TDK Hacktoberfest map: ${total - done} open quests across ${islands.length} islands, ${clock}`,
    footer: "Filled dot = merged, hollow dot = open · refreshed daily · label: hacktoberfest",
  });
  console.log(`wrote docs/journey/hacktoberfest.svg (${done}/${total} quests done, ${clock})`);
}
