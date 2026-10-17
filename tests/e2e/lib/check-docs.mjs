// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
// Case D3 of the agent suite: relative links and anchors in README.md, AGENTS.md and docs/** resolve; nothing refers to the
// removed root llms.txt / llms-full.txt or docs/ai-agents.md; the docs/agents/llms*.txt files link only to things that exist.
// Run from the repository root: node tests/e2e/lib/check-docs.mjs
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const fail = (file, message) => failures.push(`${path.relative(root, file)}: ${message}`);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const docsDir = path.join(root, "docs");
const markdown = [
  path.join(root, "README.md"),
  path.join(root, "AGENTS.md"),
  ...(existsSync(docsDir) ? walk(docsDir).filter((f) => f.endsWith(".md")) : []),
].filter(existsSync);
const llmsFiles = existsSync(path.join(docsDir, "agents"))
  ? readdirSync(path.join(docsDir, "agents"))
      .filter((n) => /^llms.*\.txt$/.test(n))
      .map((n) => path.join(docsDir, "agents", n))
  : [];
if (llmsFiles.length === 0) failures.push("docs/agents/llms*.txt: no files found");

// GitHub's heading slug: lower case, drop punctuation, spaces to dashes. Duplicates get -1, -2, ...
function anchorsOf(file) {
  const seen = new Map();
  const anchors = new Set();
  let inFence = false;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const match = !inFence && /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = match[1].replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "");
    const slug = text.toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s-]/gu, "").replace(/\s/g, "-");
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
  }
  return anchors;
}
const anchorCache = new Map();
const anchors = (file) => {
  if (!anchorCache.has(file)) anchorCache.set(file, anchorsOf(file));
  return anchorCache.get(file);
};

function stripFences(text) {
  return text.replace(/^(```|~~~)[\s\S]*?^\1/gm, (block) => block.replace(/[^\n]/g, " "));
}

function checkTarget(file, rawTarget) {
  const target = rawTarget.trim().replace(/^<|>$/g, "").split(/\s+/)[0];
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) return;
  const [pathPart, fragment] = target.split("#");
  const resolved = pathPart ? path.resolve(path.dirname(file), decodeURI(pathPart)) : file;
  const rel = path.relative(root, resolved);
  if (/^(llms(-full)?\.txt|docs\/ai-agents\.md)$/.test(rel)) return fail(file, `links to the removed ${rel}: ${rawTarget}`);
  if (!existsSync(resolved)) return fail(file, `link target does not exist: ${rawTarget}`);
  if (fragment && resolved.endsWith(".md") && !anchors(resolved).has(decodeURIComponent(fragment).toLowerCase())) {
    fail(file, `anchor not found in ${path.relative(root, resolved)}: #${fragment}`);
  }
}

for (const file of markdown) {
  const text = readFileSync(file, "utf8");
  const body = stripFences(text);
  for (const match of body.matchAll(/!?\[[^\]]*\]\(([^)\s]+(?:\s+"[^"]*")?)\)/g)) checkTarget(file, match[1]);
  for (const match of body.matchAll(/^\[[^\]]+\]:\s*(\S+)/gm)) checkTarget(file, match[1]);
  if (/docs\/ai-agents\.md/.test(text)) fail(file, "references the removed docs/ai-agents.md");
}

// The llms files are plain text: check markdown links and bare repo-relative paths.
for (const file of llmsFiles) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) checkTarget(file, match[1]);
  for (const match of text.matchAll(/(?<![\w/.-])((?:docs|cli|engine|examples|scripts)\/[\w./-]+\.(?:md|txt))/g)) {
    if (!existsSync(path.join(root, match[1]))) fail(file, `referenced file does not exist: ${match[1]}`);
  }
}

if (failures.length > 0) {
  console.error(`${failures.length} documentation problem(s):\n${failures.map((f) => `  ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`checked ${markdown.length} markdown files and ${llmsFiles.length} llms files: all links, anchors and references resolve`);
