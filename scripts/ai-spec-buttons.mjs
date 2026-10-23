#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Pure transform for AI "Write spec" buttons on issue bodies. This is the
// only implementation; .github/workflows/ai-spec-buttons.yml checks the
// default branch out (persist-credentials: false) and runs this file.
//
// Env: ISSUE_URL, ISSUE_LABELS, BODY_FILE, OUT_FILE
// Or:  node scripts/ai-spec-buttons.mjs --url U --labels a,b --body-file X --out-file Y
import { readFileSync, writeFileSync } from "node:fs";

export const MARKER = "<!-- ai-spec-buttons -->";

// One line per kind, reused for all three chat links. Chat reads the issue
// from the URL. Markdown has no shared href, so the line appears three times.
export function buildPrompt(kind, issueUrl) {
  if (kind === "openspec") {
    return `Write an OpenSpec change for this issue. Read it at ${issueUrl}.`;
  }
  return `Write a short spec for this issue. Read it at ${issueUrl}. Do not use OpenSpec.`;
}

export const PROMPTS = {
  openspec: (issueUrl) =>
    `Write an OpenSpec change for this issue. Read it at ${issueUrl}.`,
  primitive: (issueUrl) =>
    `Write a short spec for this issue. Read it at ${issueUrl}. Do not use OpenSpec.`,
};

// Circle SVGs live in the repo. Image URLs must use `main` (not the PR branch):
// the issues workflow checks out the default branch, and a branch raw URL
// 404s after merge. Shared with scripts/ai-review-buttons.mjs.
export const BADGE_BASE =
  "https://github.com/flisk-sh/flisk/raw/main/.github/badges";
export const BADGE_URLS = {
  grok: `${BADGE_BASE}/grok.svg`,
  claude: `${BADGE_BASE}/claude.svg`,
  codex: `${BADGE_BASE}/codex.svg`,
};

// GitHub issue-form bodies render labels as `### Heading`. Require two
// headings from the same template so a bug/feature body that casually
// mentions one phrase is not classified as social/license skip.
export const SKIP_TEMPLATE_SIGNATURES = {
  "adoption-question": [
    "### What would you like to know?",
    "### How do you run your services locally today?",
  ],
  "i-booted-flisk": [
    "### Minutes until first healthy URL",
    "### Commands you ran",
  ],
  "we-use-flisk": [
    "### Anything a maintainer should know",
    "### I am allowed to list this organization",
  ],
  "premium_license": [
    "### Which paid features do you need?",
    "### What are you building with Flisk?",
  ],
};

// Template title prefixes (set by issue forms). Catches a template body if
// a heading is renamed before signatures are updated.
export const SKIP_TITLE_PREFIXES = [
  "adopt: ",
  "boot: ",
  "adopter: ",
  "premium license request: ",
];

export function parseLabels(raw) {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function matchesSkipTemplate(bodyText) {
  return Object.values(SKIP_TEMPLATE_SIGNATURES).some(
    (sigs) => sigs.filter((sig) => bodyText.includes(sig)).length >= 2,
  );
}

export function matchesSkipTitle(title) {
  const t = (title ?? "").trim().toLowerCase();
  return SKIP_TITLE_PREFIXES.some((prefix) => t.startsWith(prefix));
}

/**
 * Kind resolution:
 * - skip: `question` label, social/license template title, or two `### `
 *   form headings from one of those templates
 * - openspec: `enhancement` label (wins over other labels), or feature form heading
 * - primitive: `bug`/`documentation` labels, or bug/docs form headings
 * - skip: anything with no kind signal (blank / unlabeled issues)
 */
export function resolveKind(body, labelsRaw, rawTitle) {
  const labels = parseLabels(labelsRaw);
  const bodyText = body ?? "";
  const title = (rawTitle ?? "").replace(/\r?\n/g, " ").trim();

  if (labels.has("question")) return "skip";
  if (matchesSkipTitle(title)) return "skip";
  if (matchesSkipTemplate(bodyText)) return "skip";

  // Feature wins when enhancement coexists with another work label.
  if (labels.has("enhancement")) return "openspec";
  if (bodyText.includes("### What problem are you trying to solve?")) {
    return "openspec";
  }

  if (labels.has("bug") || labels.has("documentation")) return "primitive";
  if (
    bodyText.includes("### What happened?") ||
    bodyText.includes("### What is wrong or missing?")
  ) {
    return "primitive";
  }

  // No kind signal: leave blank / unlabeled issues alone.
  return "skip";
}

export function buildButtonsHtml(kind, issueUrl) {
  const q = encodeURIComponent(buildPrompt(kind, issueUrl));
  const grok = `https://grok.com/?q=${q}`;
  const claude = `https://claude.ai/new?q=${q}`;
  const codex = `https://chatgpt.com/?q=${q}`;
  // &nbsp; keeps the row on one line. A newline makes GitHub stack each badge.
  return [
    `[![Grok](${BADGE_URLS.grok})](${grok})`,
    `[![Claude](${BADGE_URLS.claude})](${claude})`,
    `[![Codex](${BADGE_URLS.codex})](${codex})`,
  ].join("&nbsp;");
}

/** Generated section only (marker through buttons). Does not include author text. */
export function buildGeneratedSection(kind, issueUrl) {
  // No blank line between the label and the badges: a blank line stacks them.
  return [
    MARKER,
    "",
    "---",
    "",
    "**Write a spec in**",
    buildButtonsHtml(kind, issueUrl),
    "",
  ].join("\n");
}

/**
 * Append generated section after author bytes without rewriting them.
 * Only adds a deterministic separator; never trims or normalizes author content.
 */
export function joinAuthorAndSection(authorBody, section) {
  if (authorBody === "") return section;
  if (authorBody.endsWith("\n\n")) return `${authorBody}${section}`;
  if (authorBody.endsWith("\n")) return `${authorBody}\n${section}`;
  return `${authorBody}\n\n${section}`;
}

/**
 * @returns {{ action: "skip" | "patch", body: string, reason: string, kind: string }}
 *   - skip when kind is skip (leave any existing marker in place)
 *   - append when the marker is missing
 *   - regenerate the generated tail when URL/kind drift
 *   - skip when the tail already matches
 */
export function transformBody(body, rawTitle, issueUrl, labelsRaw) {
  const url = (issueUrl ?? "").trim();
  const kind = resolveKind(body, labelsRaw, rawTitle);

  if (kind === "skip") {
    return { action: "skip", body, reason: "kind is skip", kind };
  }

  if (!url) {
    return { action: "skip", body, reason: "missing issue url", kind };
  }

  const section = buildGeneratedSection(kind, url);
  const idx = body.indexOf(MARKER);

  if (idx === -1) {
    return {
      action: "patch",
      body: joinAuthorAndSection(body, section),
      reason: `append spec buttons (${kind})`,
      kind,
    };
  }

  const authorPart = body.slice(0, idx);
  const existing = body.slice(idx);
  const existingNorm = existing.replace(/\s+$/, "");
  const sectionNorm = section.replace(/\s+$/, "");
  if (existingNorm === sectionNorm) {
    return {
      action: "skip",
      body,
      reason: "marker present and prompt matches",
      kind,
    };
  }
  return {
    action: "patch",
    body: joinAuthorAndSection(authorPart, section),
    reason: `regenerate spec buttons for current url/kind (${kind})`,
    kind,
  };
}

function parseArgs(argv) {
  const out = {
    url: process.env.ISSUE_URL,
    labels: process.env.ISSUE_LABELS,
    bodyFile: process.env.BODY_FILE,
    outFile: process.env.OUT_FILE,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") out.url = argv[++i];
    else if (a === "--labels") out.labels = argv[++i];
    else if (a === "--body-file") out.bodyFile = argv[++i];
    else if (a === "--out-file") out.outFile = argv[++i];
  }
  return out;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.bodyFile && opts.outFile) {
  const body = readFileSync(opts.bodyFile, "utf8");
  const result = transformBody(body, "", opts.url ?? "", opts.labels ?? "");
  writeFileSync(opts.outFile, result.body, "utf8");
  console.log(`${result.action}: ${result.reason}`);
}
