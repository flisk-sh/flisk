// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Draws the tab bars in the docs from docs/tabs.json. GitHub Markdown runs no scripts and keeps no styles, so a tab is an SVG
// image linked to a page of its own: every tab has a sibling page that repeats the bar with that tab selected, and a host page
// (the README, say) shows one tab's panel inline. This script writes
//   docs/assets/tabs/<group>/*.svg  one image per tab and state, plus the "3 agents" counter. The name carries a hash of the
//                                   content, so a style change gets new URLs and GitHub's image cache never shows an old tab.
//   the bar in every page           from <!-- tabs:<group> <selected> ... --> to the <tr><td> that opens the panel, and the
//                                   </td></tr></table> before <!-- /tabs:<group> -->. The panel between them is hand-written
//                                   and kept as it is.
//   a missing sibling page          a stub with the bar and a title, to fill in
// The images are vector, light and dark aware through prefers-color-scheme inside the SVG, and sized from Arial metrics
// (metric-compatible with Helvetica); textLength pins every label to that width, so a different system font cannot overflow.
//   node scripts/docs/tabs.mjs [--root <repo dir>]           write everything
//   node scripts/docs/tabs.mjs [--root <repo dir>] --check   exit 1 when anything is out of date (run by D4 in
//                                                            tests/e2e/static/skills-and-docs.sh)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { frameSvgs } from "./frames.mjs";
import { textWidth } from "./metrics.mjs";

export { textWidth };

export const SPEC = "docs/tabs.json";
export const ASSETS = "docs/assets/tabs";
const GENERATOR = "scripts/docs/tabs.mjs";

// GitHub's Primer colors (UnderlineNav, Counter) for the light and dark default themes.
const COLORS = {
  light: { fg: "#1f2328", muted: "#59636e", wash: "#818b981f", accent: "#fd8c73" },
  dark: { fg: "#f0f6fc", muted: "#9198a1", wash: "#656c7633", accent: "#f78166" },
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif";

// Generic 16x16 line glyphs, drawn for these docs (no product logos). Stroked with the tab's icon color.
export const ICONS = {
  terminal: '<rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2"/><path d="M4.75 6.25 7 8.5l-2.25 2.25M8.75 10.75h2.5"/>',
  code: '<path d="M5.25 4.25 1.5 8l3.75 3.75M10.75 4.25 14.5 8l-3.75 3.75"/>',
  pointer: '<path d="M3.25 1.75v11l2.9-2.65 2 4.15 1.9-.9-2-4.1h3.95Z"/>',
  package:
    '<path d="M8 1.75 14.25 5v6L8 14.25 1.75 11V5Z"/><path d="M1.75 5 8 8.25 14.25 5M8 8.25v6M4.9 3.4l6.25 3.25"/>',
  zap: '<path d="M9.25 1.5 3.25 9h4.5l-1 5.5L12.75 7h-4.5Z"/>',
  download: '<path d="M8 1.75v8.5M4.75 7 8 10.25 11.25 7M2.25 11v1.75c0 .83.67 1.5 1.5 1.5h8.5c.83 0 1.5-.67 1.5-1.5V11"/>',
  laptop: '<rect x="2.75" y="2.75" width="10.5" height="7.75" rx="1.25"/><path d="M1 13.25h14"/>',
  server:
    '<rect x="1.75" y="2" width="12.5" height="5" rx="1.25"/><rect x="1.75" y="9" width="12.5" height="5" rx="1.25"/><path d="M4.5 4.5h.01M4.5 11.5h.01"/>',
  cloud: '<path d="M4.5 12.75h7.25a3 3 0 0 0 .35-5.98 4.25 4.25 0 0 0-8.2.43A2.8 2.8 0 0 0 4.5 12.75Z"/>',
  link: '<path d="M6.75 9.25 9.25 6.75M7.25 4.5l1-1a2.47 2.47 0 0 1 3.5 3.5l-1 1M8.75 11.5l-1 1a2.47 2.47 0 0 1-3.5-3.5l1-1"/>',
  tiles:
    '<rect x="1.75" y="2.25" width="6.5" height="11.5" rx="1.25"/><rect x="9.75" y="2.25" width="4.5" height="5" rx="1.25"/><rect x="9.75" y="8.75" width="4.5" height="5" rx="1.25"/>',
  window: '<rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2"/><path d="M1.75 6h12.5M4.25 4.4h.01M6 4.4h.01"/>',
  play: '<path d="M4.75 2.75v10.5L13 8Z"/>',
  sparkle: '<path d="M8 1.75C8.4 5.6 10.4 7.6 14.25 8 10.4 8.4 8.4 10.4 8 14.25 7.6 10.4 5.6 8.4 1.75 8 5.6 7.6 7.6 5.6 8 1.75Z"/>',
  sliders:
    '<path d="M1.75 4.5h6.5M12.25 4.5h2M1.75 11.5h2M7.75 11.5h6.5"/><circle cx="10.25" cy="4.5" r="2"/><circle cx="5.75" cy="11.5" r="2"/>',
  chat: '<path d="M2.25 3.75c0-.83.67-1.5 1.5-1.5h8.5c.83 0 1.5.67 1.5 1.5v5.5c0 .83-.67 1.5-1.5 1.5H7.5L4.5 13.5v-2.75h-.75c-.83 0-1.5-.67-1.5-1.5Z"/>',
};

const HEIGHT = 48;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function style(rules) {
  const css = (c) => rules(c).replace(/\s+/g, "");
  return `<style>${css(COLORS.light)}@media (prefers-color-scheme:dark){${css(COLORS.dark)}}</style>`;
}

// One tab. Both states of a tab have the same width (the bold label's), so the bar does not shift between sibling pages.
// Selected: bold label, a rounded wash behind it and a 2px accent underline, as in GitHub's UnderlineNav. icon is optional.
export function tabSvg({ label, icon }, selected) {
  if (icon !== undefined && !ICONS[icon]) {
    throw new Error(`unknown icon "${icon}" for tab "${label}"; known: ${Object.keys(ICONS).join(", ")}`);
  }
  const weight = selected ? 600 : 400;
  const slot = Math.max(textWidth(label, 14, 600), textWidth(label, 14, 400));
  const textX = icon ? 40 : 18;
  const width = textX + slot + (icon ? 16 : 18);
  const title = selected ? `${label} (selected)` : label;
  const css = (c) => `.t{fill:${c.fg}}.i{stroke:${selected ? c.fg : c.muted}}.w{fill:${c.wash}}.u{fill:${c.accent}}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}" role="img" aria-label="${esc(title)}">`,
    `<title>${esc(title)}</title>`,
    style(css),
    selected ? `<rect class="w" x="8" y="8" width="${width - 16}" height="32" rx="6"/>` : "",
    selected ? `<rect class="u" x="8" y="46" width="${width - 16}" height="2" rx="1"/>` : "",
    icon ? `<g class="i" transform="translate(16 16)" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[icon]}</g>` : "",
    `<text class="t" x="${textX}" y="29" font-family="${FONT}" font-size="14" font-weight="${weight}" textLength="${textWidth(label, 14, weight)}" lengthAdjust="spacingAndGlyphs">${esc(label)}</text>`,
    "</svg>",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

// The counter after the last tab ("3 agents"), drawn like Primer's Counter.
export function counterSvg(text) {
  const inner = textWidth(text, 12, 600);
  const pill = inner + 16;
  const width = pill + 16;
  const css = (c) => `.t{fill:${c.muted}}.w{fill:${c.wash}}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}" role="img" aria-label="${esc(text)}">`,
    `<title>${esc(text)}</title>`,
    style(css),
    `<rect class="w" x="8" y="14" width="${pill}" height="20" rx="10"/>`,
    `<text class="t" x="${8 + pill / 2}" y="28" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="600" textLength="${inner}" lengthAdjust="spacingAndGlyphs">${esc(text)}</text>`,
    "</svg>",
    "",
  ].join("\n");
}

const hashed = (base, svg) => `${base}.${createHash("sha256").update(svg).digest("hex").slice(0, 8)}.svg`;

function loadSpec(root) {
  const spec = JSON.parse(readFileSync(path.join(root, SPEC), "utf8"));
  const ids = new Set();
  for (const group of spec.groups) {
    if (!/^[a-z0-9-]+$/.test(group.id) || ids.has(group.id)) throw new Error(`${SPEC}: bad or duplicate group id "${group.id}"`);
    ids.add(group.id);
    const slugs = new Set(group.tabs.map((t) => t.slug));
    if (slugs.size !== group.tabs.length || group.tabs.length < 2) throw new Error(`${SPEC}: group ${group.id} needs 2+ unique tabs`);
    for (const host of group.hosts ?? []) {
      if (!slugs.has(host.selected)) throw new Error(`${SPEC}: ${host.file} selects unknown tab ${group.id}/${host.selected}`);
    }
  }
  return spec;
}

// Everything the spec produces: asset files (path -> content) and, per page, the blocks it must contain.
export function plan(root) {
  const spec = loadSpec(root);
  const assets = new Map();
  const pages = new Map();
  for (const group of spec.groups) {
    const dir = `${ASSETS}/${group.id}`;
    const images = new Map();
    for (const tab of group.tabs) {
      for (const selected of [false, true]) {
        const svg = tabSvg(tab, selected);
        const file = `${dir}/${hashed(selected ? `${tab.slug}-selected` : tab.slug, svg)}`;
        assets.set(file, svg);
        images.set(`${tab.slug}:${selected}`, { file, svg });
      }
      if (tab.frame) {
        for (const [part, svg] of Object.entries(frameSvgs(tab.frame, `${group.id}/${tab.slug}`))) {
          const file = `${dir}/${hashed(`${tab.slug}-${part}`, svg)}`;
          assets.set(file, svg);
          images.set(`${tab.slug}:${part}`, { file, svg });
        }
      }
    }
    const count = `${group.tabs.length} ${group.count}`;
    const counter = counterSvg(count);
    const counterFile = `${dir}/${hashed("count", counter)}`;
    assets.set(counterFile, counter);

    const pageOf = (tab) => `${group.dir}/${tab.slug}.md`;
    const embeds = [
      ...group.tabs.map((tab) => ({ file: pageOf(tab), selected: tab.slug, sibling: tab })),
      ...(group.hosts ?? []).map((host) => ({ file: host.file, selected: host.selected })),
    ];
    for (const embed of embeds) {
      const from = path.posix.dirname(embed.file);
      const rel = (to) => path.posix.relative(from, to) || path.posix.basename(to);
      const img = (file, alt, width) => `<img src="${rel(file)}" alt="${esc(alt)}" width="${width}" height="${HEIGHT}" align="top">`;
      const widthOf = (svg) => /width="(\d+)"/.exec(svg)[1];
      const links = group.tabs.map((tab) => {
        const selected = tab.slug === embed.selected;
        const { file, svg } = images.get(`${tab.slug}:${selected}`);
        return `<a href="${rel(pageOf(tab))}">${img(file, selected ? `${tab.label} (selected)` : tab.label, widthOf(svg))}</a>`;
      });
      const current = group.tabs.find((t) => t.slug === embed.selected);
      links.push(`<a href="${rel(pageOf(current))}">${img(counterFile, count, widthOf(counter))}</a>`);
      // A framed tab gets a row above the bar and one below the panel. width="100%" with no height lets the frame scale to
      // the table (a percentage max-width adds nothing to the table's minimum width).
      const frameRow = (part) => {
        const { file, svg } = images.get(`${current.slug}:${part}`);
        const alt = /<title>(.*)<\/title>/.exec(svg)[1]; // already escaped by frames.mjs
        return `<tr><td><img src="${rel(file)}" alt="${alt}" width="100%" align="top"></td></tr>`;
      };
      // "panel": false draws the bar alone. The tab's content follows the block as plain Markdown, which suits wide content
      // such as a comparison table: nested in a cell, GitHub sizes a table to its longest cells and it overflows the page.
      if (group.panel === false) {
        const head = [
          `<!-- tabs:${group.id} ${embed.selected} · generated by ${GENERATOR} from ${SPEC}; the tab's content follows this block -->`,
          "<table>",
          `<tr><td>${links.join("")}</td></tr>`,
          "</table>",
          "",
        ].join("\n");
        if (!pages.has(embed.file)) pages.set(embed.file, []);
        pages.get(embed.file).push({ group, embed, head, tail: `<!-- /tabs:${group.id} -->`, back: group.back && rel(group.back) });
        continue;
      }
      const head = [
        `<!-- tabs:${group.id} ${embed.selected} · generated by ${GENERATOR} from ${SPEC}; edit the panel below, not the bar -->`,
        "<table>",
        ...(current.frame ? [frameRow("top")] : []),
        `<tr><td>${links.join("")}</td></tr>`,
        "<tr><td>",
        "",
        "",
      ].join("\n");
      const tail = `</td></tr>\n${current.frame ? `${frameRow("bottom")}\n` : ""}</table>\n<!-- /tabs:${group.id} -->`;
      if (!pages.has(embed.file)) pages.set(embed.file, []);
      pages.get(embed.file).push({ group, embed, head, tail, back: group.back && rel(group.back) });
    }
  }
  return { assets, pages };
}

const BEGIN = /<!-- tabs:([a-z0-9-]+) ([a-z0-9-]+)[^\n]*?-->\n/g;

// A code block cannot wrap, and GitHub sizes a table to its widest line: a longer line than this widens the whole panel past
// an 861px-wide page (README at 1280px) and cuts off its text. 91 characters overflowed by 11px; 88 fit.
export const MAX_CODE_LINE = 88;

function longCodeLines(panel) {
  let fence = null;
  const long = [];
  for (const line of panel.split("\n")) {
    const marker = /^\s*(```|~~~)/.exec(line);
    if (marker && (!fence || marker[1] === fence)) fence = fence ? null : marker[1];
    else if (fence && line.length > MAX_CODE_LINE) long.push(line.length);
  }
  return long;
}

// Rewrites the bar of every block in a page; the panel text is kept, with its leading and trailing blank lines normalized.
export function rewrite(text, blocks, file) {
  const problems = [];
  const byGroup = new Map(blocks.map((b) => [b.group.id, b]));
  const seen = new Set();
  let out = "";
  let at = 0;
  for (const match of text.matchAll(BEGIN)) {
    if (match.index < at) continue;
    const id = match[1];
    const block = byGroup.get(id);
    if (block?.group.panel === false) {
      const close = text.indexOf(`<!-- /tabs:${id} -->`, match.index);
      if (close < 0) {
        problems.push(`${file}: tabs:${id} block has no closing <!-- /tabs:${id} -->`);
        continue;
      }
      if (seen.has(id)) problems.push(`${file}: more than one tabs:${id} block`);
      seen.add(id);
      out += text.slice(at, match.index) + block.head + block.tail;
      at = close + `<!-- /tabs:${id} -->`.length;
      continue;
    }
    const open = text.indexOf("\n<tr><td>\n", match.index);
    const endMarker = `<!-- /tabs:${id} -->`;
    const close = open < 0 ? -1 : text.indexOf(endMarker, open);
    if (!block) {
      problems.push(`${file}: has a tabs:${id} block that ${SPEC} does not list for this page`);
      continue;
    }
    if (close < 0) {
      problems.push(`${file}: tabs:${id} block has no "<tr><td>" line or no closing ${endMarker}`);
      continue;
    }
    if (seen.has(id)) problems.push(`${file}: more than one tabs:${id} block`);
    seen.add(id);
    const panel = text
      .slice(open + "\n<tr><td>\n".length, close)
      .replace(/\s*<\/td><\/tr>(\s*<tr><td><img [^\n]*<\/td><\/tr>)?\s*<\/table>\s*$/, "")
      .replace(/^\s*\n/, "")
      .trimEnd();
    for (const length of longCodeLines(panel)) {
      problems.push(`${file}: tabs:${id} panel has a ${length}-character code line; GitHub then widens the panel past the page. Keep code lines to ${MAX_CODE_LINE} (end a shell line with \\)`);
    }
    out += text.slice(at, match.index) + block.head + panel + "\n\n" + block.tail;
    at = close + endMarker.length;
  }
  out += text.slice(at);
  for (const block of blocks) {
    if (!seen.has(block.group.id)) {
      problems.push(`${file}: missing the tabs:${block.group.id} block (${SPEC} lists it with "${block.embed.selected}" selected)`);
    }
  }
  return { text: out, problems };
}

function stub(blocks) {
  const { sibling } = blocks[0].embed;
  const back = blocks[0].back ? `[← Back](${blocks[0].back})\n\n` : "";
  const body = (b) => (b.group.panel === false ? `${b.head}${b.tail}\n\n_Write this tab._` : `${b.head}_Write this tab._\n\n${b.tail}`);
  return `# ${sibling.title ?? sibling.label}\n\n${back}${blocks.map(body).join("\n\n")}\n`;
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

// Pages that must not carry a block the spec does not list: the README, docs/** and the example READMEs.
function markdownFiles(root) {
  const rel = (f) => path.relative(root, f).split(path.sep).join("/");
  return [
    "README.md",
    ...walk(path.join(root, "docs")).filter((f) => f.endsWith(".md")).map(rel),
    ...walk(path.join(root, "examples")).filter((f) => f.endsWith("/README.md")).map(rel),
  ].filter((f) => existsSync(path.join(root, f)));
}

// Returns the list of out-of-date things. With write, fixes them first (and then returns only what cannot be fixed).
export function run(root, { write }) {
  const { assets, pages } = plan(root);
  const stale = [];
  const problems = [];

  const onDisk = walk(path.join(root, ASSETS)).map((f) => path.relative(root, f).split(path.sep).join("/"));
  for (const file of onDisk) {
    if (assets.has(file)) continue;
    stale.push(`${file}: not produced by ${SPEC}`);
    if (write) rmSync(path.join(root, file));
  }
  for (const [file, svg] of assets) {
    const full = path.join(root, file);
    if (existsSync(full) && readFileSync(full, "utf8") === svg) continue;
    stale.push(`${file}: missing or out of date`);
    if (write) {
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, svg);
    }
  }

  for (const file of new Set([...pages.keys(), ...markdownFiles(root)])) {
    const blocks = pages.get(file) ?? [];
    const full = path.join(root, file);
    if (!existsSync(full)) {
      stale.push(`${file}: missing sibling page`);
      if (write) {
        mkdirSync(path.dirname(full), { recursive: true });
        writeFileSync(full, stub(blocks));
      }
      continue;
    }
    const text = readFileSync(full, "utf8");
    if (blocks.length === 0 && !/<!-- tabs:/.test(text)) continue;
    const result = rewrite(text, blocks, file);
    problems.push(...result.problems);
    if (result.text !== text) {
      stale.push(`${file}: tab bar out of date`);
      if (write) writeFileSync(full, result.text);
    }
  }
  return { stale, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const rootAt = args.indexOf("--root");
  const root = path.resolve(rootAt >= 0 ? args[rootAt + 1] : path.join(path.dirname(fileURLToPath(import.meta.url)), "../.."));
  const check = args.includes("--check");
  const { stale, problems } = run(root, { write: !check });
  for (const line of problems) console.error(`FAIL ${line}`);
  if (check && stale.length > 0) {
    console.error(`${stale.length} generated tab file(s) out of date:\n${stale.map((s) => `  ${s}`).join("\n")}`);
    console.error(`Run: node ${GENERATOR}`);
  } else if (!check) {
    for (const line of stale) console.log(`updated ${line.replace(/:.*/, "")}`);
  }
  if (problems.length > 0 || (check && stale.length > 0)) process.exit(1);
  if (check) console.log(`tabs up to date (${SPEC})`);
}
