// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Puts the Hacktoberfest map at the top of every open issue labelled `hacktoberfest` that does not show it yet.
// Safe to re-run: issues that already embed the map are skipped. Needs the `gh` CLI with issues: write.
// Run: node scripts/hacktoberfest-embed.mjs [owner/repo]
import { execFileSync } from "node:child_process";

const repo = process.argv[2] ?? "flisk-sh/flisk";
const MAP = `https://raw.githubusercontent.com/${repo}/journey-map/docs/journey/hacktoberfest.svg`;
const LIST = `https://github.com/${repo}/issues?q=is%3Aissue+is%3Aopen+label%3Ahacktoberfest`;
const banner = `[![Flisk Hacktoberfest map](${MAP})](${LIST})

*🎃 Part of Hacktoberfest. Filled dot = merged, hollow dot = open. Click the map for all open \`hacktoberfest\` issues.*

`;

const gh = (args, input) =>
  execFileSync("gh", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });

const issues = JSON.parse(
  gh([
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
  ]),
);

let added = 0;
for (const issue of issues) {
  const body = issue.body ?? "";
  if (body.includes("/docs/journey/hacktoberfest.svg")) continue;
  gh(["issue", "edit", String(issue.number), "-R", repo, "--body-file", "-"], banner + body);
  added++;
  console.log(`added map to #${issue.number}`);
}
console.log(`${added} added, ${issues.length - added} already had it`);
