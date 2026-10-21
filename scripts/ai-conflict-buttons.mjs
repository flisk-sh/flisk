#!/usr/bin/env node
// Copyright (c) 2026 Flisk contributors
// SPDX-License-Identifier: MIT
// Pure transform for the AI conflict-resolve comment. The workflow posts or
// updates one PR comment; this file only builds that comment body.
//
// Env: PR_URL, PR_NUMBER, HEAD_OWNER, HEAD_BRANCH, BASE_BRANCH, PR_BODY_FILE, CONFLICTING, OUT_FILE
// Or:  node scripts/ai-conflict-buttons.mjs --url U --number N --owner O --branch B --base main --body-file X --conflicting true --out-file Y
import { readFileSync, writeFileSync } from "node:fs";

export const MARKER = "<!-- ai-conflict-buttons -->";

const CLOSING_RE = /\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#(\d+)\b/i;

export function closingIssue(body) {
  const match = CLOSING_RE.exec(body ?? "");
  return match ? match[1] : "";
}

export function buildPrompt({ prUrl, headOwner, headBranch, baseBranch, prNumber, body }) {
  const owner = (headOwner ?? "").trim();
  const branch = (headBranch ?? "").trim();
  const base = (baseBranch ?? "").trim() || "main";
  const number = String(prNumber ?? "").trim();
  const issue = closingIssue(body);
  const replacement = issue
    ? `open a replacement PR that says Fixes #${issue}`
    : "open a replacement PR";
  return [
    `Resolve the merge conflict on ${prUrl}.`,
    `Fetch ${owner} ${branch} and merge origin/${base}.`,
    `Keep the changes from that branch. Keep ${base}'s changes.`,
    "Rebuild cli/dist.",
    `Push to ${branch} if allowed, otherwise push fix/${number}-conflict and ${replacement}.`,
  ].join(" ");
}

function codexLogo() {
  return encodeURIComponent(
    "data:image/svg+xml;base64," +
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#fff" d="M22.28 9.82a6 6 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a6 6 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 6 6 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 6 6 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07z"/></svg>`,
      ).toString("base64"),
  );
}

export function buildButtonsHtml(prompt) {
  const q = encodeURIComponent(prompt);
  const badge = (name, color, logo) =>
    `https://img.shields.io/badge/${encodeURIComponent(name)}-${color}?style=for-the-badge&logo=${logo}&logoColor=white`;
  return [
    `[![Grok](${badge("Resolve conflict", "111111", "x")})](https://grok.com/?q=${q})`,
    `[![Claude](${badge("Resolve conflict", "D97757", "anthropic")})](https://claude.ai/new?q=${q})`,
    `[![Codex](${badge("Resolve conflict", "10A37F", codexLogo())})](https://chatgpt.com/?q=${q})`,
  ].join("&nbsp;");
}

/** Comment body. Buttons only while the PR still conflicts with main. */
export function buildComment(input) {
  const conflicting = input.conflicting === true || input.conflicting === "true";
  if (!conflicting) {
    return [MARKER, "", "This pull request no longer conflicts with `main`.", ""].join("\n");
  }
  const prompt = buildPrompt(input);
  return [
    MARKER,
    "",
    "This pull request conflicts with `main`.",
    "",
    "# Resolve this conflict in",
    buildButtonsHtml(prompt),
    "",
  ].join("\n");
}

function parseArgs(argv) {
  const out = {
    url: process.env.PR_URL,
    number: process.env.PR_NUMBER,
    owner: process.env.HEAD_OWNER,
    branch: process.env.HEAD_BRANCH,
    bodyFile: process.env.PR_BODY_FILE,
    conflicting: process.env.CONFLICTING,
    outFile: process.env.OUT_FILE,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") out.url = argv[++i];
    else if (a === "--number") out.number = argv[++i];
    else if (a === "--owner") out.owner = argv[++i];
    else if (a === "--branch") out.branch = argv[++i];
    else if (a === "--base") out.baseBranch = argv[++i];
    else if (a === "--body-file") out.bodyFile = argv[++i];
    else if (a === "--conflicting") out.conflicting = argv[++i];
    else if (a === "--out-file") out.outFile = argv[++i];
  }
  return out;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.bodyFile && opts.outFile) {
  const body = readFileSync(opts.bodyFile, "utf8");
  const comment = buildComment({
    prUrl: opts.url ?? "",
    prNumber: opts.number ?? "",
    headOwner: opts.owner ?? "",
    headBranch: opts.branch ?? "",
    baseBranch: opts.baseBranch ?? "",
    body,
    conflicting: opts.conflicting,
  });
  writeFileSync(opts.outFile, comment, "utf8");
  console.log(opts.conflicting === "true" ? "conflict comment" : "resolved comment");
}
