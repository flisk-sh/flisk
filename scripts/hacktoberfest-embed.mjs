// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Puts the Hacktoberfest map at the top of every open issue labelled `hacktoberfest` that does not show it yet.
// Safe to re-run: issues that already embed the map are skipped. Needs the `gh` CLI with issues: write.
// Run: node scripts/hacktoberfest-embed.mjs [owner/repo]
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_REPO = "flisk-sh/flisk";
export const MAP_PATH = "/docs/journey/hacktoberfest.svg";

export function mapUrl(repo = DEFAULT_REPO) {
  return `https://raw.githubusercontent.com/${repo}/journey-map/docs/journey/hacktoberfest.svg`;
}

export function listUrl(repo = DEFAULT_REPO) {
  return `https://github.com/${repo}/issues?q=is%3Aissue+is%3Aopen+label%3Ahacktoberfest`;
}

export function bannerMarkup(repo = DEFAULT_REPO) {
  const map = mapUrl(repo);
  const list = listUrl(repo);
  return `[![Flisk Hacktoberfest map](${map})](${list})\n\n*\u{1F383} Part of Hacktoberfest. Filled dot = merged, hollow dot = open. Click the map for all open \`hacktoberfest\` issues.*\n\n`;
}

export const banner = bannerMarkup;

export function shouldEmbed(body) {
  return !(body ?? "").includes(MAP_PATH);
}

export function embedMarkup(body, repo = DEFAULT_REPO) {
  const current = body ?? "";
  if (!shouldEmbed(current)) {
    return current;
  }
  return bannerMarkup(repo) + current;
}

export function defaultRunner(args, input) {
  return execFileSync("gh", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
}

export function embedIssues({
  repo = DEFAULT_REPO,
  runner = defaultRunner,
  log = console.log,
} = {}) {
  if (!repo || typeof repo !== "string" || repo.trim() === "") {
    throw new Error("Repository is required");
  }

  const raw = runner([
    "issue",
    "list",
    "-R",
    repo,
    "--state",
    "open",
    "--label",
    "hacktoberfest",
    "--limit",
    "1000",
    "--json",
    "number,body",
  ]);

  if (raw === undefined || raw === null || raw === "") {
    throw new Error("Missing runner output for issues list");
  }

  let issues;
  try {
    issues = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse issues JSON: ${err.message}`);
  }

  if (!Array.isArray(issues)) {
    throw new Error("Expected JSON array of issues");
  }

  const mark = bannerMarkup(repo);
  let added = 0;
  for (const issue of issues) {
    if (!issue || typeof issue.number !== "number") {
      throw new Error("Invalid issue entry: missing number");
    }
    const body = issue.body ?? "";
    if (!shouldEmbed(body)) continue;
    runner(["issue", "edit", String(issue.number), "-R", repo, "--body-file", "-"], mark + body);
    added++;
    log(`added map to #${issue.number}`);
  }
  log(`${added} added, ${issues.length - added} already had it`);
  return { added, skipped: issues.length - added, total: issues.length };
}

export function main(
  argv = process.argv.slice(2),
  { runner = defaultRunner, log = console.log, error = console.error } = {},
) {
  const repo = argv.length > 0 && argv[0] !== undefined ? argv[0] : DEFAULT_REPO;
  if (!repo || repo.trim() === "") {
    error("Repository must not be empty");
    return 1;
  }
  try {
    embedIssues({ repo, runner, log });
    return 0;
  } catch (err) {
    error(err.message ?? String(err));
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = main(process.argv.slice(2));
  if (code !== 0) {
    process.exit(code);
  }
}
