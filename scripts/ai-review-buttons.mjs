#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Pure transform for AI review buttons on PR bodies. This is the only
// implementation; .github/workflows/ai-review-buttons.yml checks the default
// branch out (persist-credentials: false) and runs this file.
//
// Env: PR_URL, BODY_FILE, OUT_FILE
// Or:  node scripts/ai-review-buttons.mjs --url U --body-file X --out-file Y
import { readFileSync, writeFileSync } from "node:fs";

export const MARKER = "<!-- ai-review-buttons -->";
export const LEGACY_MARKER = "<!-- grok-review-button -->";
export const MARKERS = [MARKER, LEGACY_MARKER];

// One line, reused for all three chat links. Chat reads the PR from the URL.
export function buildPrompt(prUrl) {
  return `Review this pull request. Read the title and diff at ${prUrl}.`;
}

export function buildButtonsHtml(prUrl) {
  const q = encodeURIComponent(buildPrompt(prUrl));
  // Product name only + logo. A blank line between badges stacks them;
  // &nbsp; keeps the row together on one line.
  const badge = (name, color, logo) =>
    `https://img.shields.io/badge/${encodeURIComponent(name)}-${color}?style=for-the-badge&logo=${logo}&logoColor=white`;

  // OpenAI/Codex slug was removed from Shields. Embed a white mark.
  // logoColor does not recolor data-URI logos; the SVG fill must be white.
  const codexLogo = encodeURIComponent(
    "data:image/svg+xml;base64," +
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#fff" d="M22.28 9.82a6 6 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a6 6 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 6 6 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 6 6 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07z"/></svg>`,
      ).toString("base64"),
  );

  return [
    `[![Grok](${badge("Grok", "111111", "x")})](https://grok.com/?q=${q})`,
    `[![Claude](${badge("Claude", "D97757", "anthropic")})](https://claude.ai/new?q=${q})`,
    `[![Codex](${badge("Codex", "10A37F", codexLogo)})](https://chatgpt.com/?q=${q})`,
  ].join("&nbsp;");
}

/** Generated section only (marker through buttons). Does not include author text. */
export function buildGeneratedSection(prUrl) {
  // Heading, then badges on the next line. No blank line: a blank line
  // makes GitHub treat each shield as its own block and stack them.
  // Badges stay out of the heading so they are not dropped below it.
  return [
    MARKER,
    "",
    "---",
    "",
    "# Review this PR in",
    buildButtonsHtml(prUrl),
    "",
    "<sub>Shared by [@flisk-sh](https://github.com/flisk-sh) · [flisk](https://github.com/flisk-sh/flisk) · If this helps, please ⭐ [star flisk](https://github.com/flisk-sh/flisk)</sub>",
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

function markerIndex(body) {
  let idx = -1;
  for (const m of MARKERS) {
    const i = body.indexOf(m);
    if (i !== -1 && (idx === -1 || i < idx)) idx = i;
  }
  return idx;
}

/**
 * @returns {{ action: "skip" | "patch", body: string, reason: string }}
 *   - append when the marker is missing
 *   - regenerate the generated tail when URL (or prompt wording) drift
 *   - skip when the tail already matches the current URL
 */
export function transformBody(body, prUrl) {
  const url = (prUrl ?? "").trim();

  if (!url) {
    return { action: "skip", body, reason: "missing pr url" };
  }

  const section = buildGeneratedSection(url);
  const idx = markerIndex(body);

  if (idx === -1) {
    return {
      action: "patch",
      body: joinAuthorAndSection(body, section),
      reason: "append review buttons",
    };
  }

  const authorPart = body.slice(0, idx);
  const existing = body.slice(idx);
  const existingNorm = existing.replace(/\s+$/, "");
  const sectionNorm = section.replace(/\s+$/, "");
  if (existingNorm === sectionNorm) {
    return { action: "skip", body, reason: "marker present and prompt matches" };
  }
  return {
    action: "patch",
    body: joinAuthorAndSection(authorPart, section),
    reason: "regenerate review buttons for current url",
  };
}

function parseArgs(argv) {
  const out = {
    url: process.env.PR_URL,
    bodyFile: process.env.BODY_FILE,
    outFile: process.env.OUT_FILE,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") out.url = argv[++i];
    else if (a === "--body-file") out.bodyFile = argv[++i];
    else if (a === "--out-file") out.outFile = argv[++i];
  }
  return out;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.bodyFile && opts.outFile) {
  const body = readFileSync(opts.bodyFile, "utf8");
  const result = transformBody(body, opts.url ?? "");
  writeFileSync(opts.outFile, result.body, "utf8");
  console.log(`${result.action}: ${result.reason}`);
}
