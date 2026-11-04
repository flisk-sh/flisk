// Copyright (c) 2026 Flisk Landscape contributors
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
// A fullwidth at-sign (U+FF20) breaks copy-paste commands and the "@grok" trigger in these files.
for (const file of llmsFiles) {
  if (readFileSync(file, "utf8").includes("\uFF20")) {
    failures.push(`${path.relative(root, file)}: contains a fullwidth at-sign (U+FF20); use the ASCII at-sign`);
  }
}

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

// Documentation consistency check: version floors in docs must match the CLI code.
// The code floors are the source of truth; docs must not list a lower minimum.
function checkVersionFloors() {
  const doctorPath = path.join(root, "cli", "src", "commands", "doctor.ts");
  if (!existsSync(doctorPath)) return;
  const doctorSource = readFileSync(doctorPath, "utf8");

  const floorOf = (name) => {
    const match = doctorSource.match(
      new RegExp(`const MIN_${name}_VERSION = \\[(\\d+),\\s*(\\d+),\\s*(\\d+)\\]`, "s"),
    );
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  };

  const floors = {
    DOCKER_COMPOSE: floorOf("DOCKER_COMPOSE"),
    BUN: floorOf("BUN"),
    TILT: floorOf("TILT"),
  };

  const versionStr = (floor) => (floor ? floor.join(".") : null);
  const expected = {
    "Docker Compose": versionStr(floors.DOCKER_COMPOSE),
    Bun: versionStr(floors.BUN),
    Tilt: versionStr(floors.TILT),
    "Node.js": "22.12",
  };

  const docFiles = [path.join(root, "README.md"), path.join(root, "docs", "quickstart.md")].filter(
    (f) => existsSync(f),
  );

  for (const file of docFiles) {
    const text = readFileSync(file, "utf8");
    for (const [tool, floorVersion] of Object.entries(expected)) {
      if (!floorVersion) continue;
      // Accept both the full floor (e.g. "1.2.0+") and the shortened form when the patch is 0 (e.g. "1.2+").
      const patterns = [floorVersion];
      const parts = floorVersion.split(".");
      if (parts.length === 3 && parts[2] === "0") patterns.push(`${parts[0]}.${parts[1]}`);
      const matched = patterns.some((p) => {
        const re = new RegExp(`${p.replace(/[.+*?^${}()|[\]\\]/g, "\\$&")}\\+?`, "i");
        return re.test(text);
      });
      if (!matched) {
        fail(file, `prerequisites table lists ${tool} below the code floor ${floorVersion}+`);
      }
    }
  }
}

checkVersionFloors();

if (failures.length > 0) {
  console.error(`${failures.length} documentation problem(s):\n${failures.map((f) => `  ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`checked ${markdown.length} markdown files and ${llmsFiles.length} llms files: all links, anchors and references resolve`);
