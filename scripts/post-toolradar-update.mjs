#!/usr/bin/env node
// Posts a released version's changelog on Toolradar, called by release-binaries.yml once the release is public.
// Toolradar allows one post per product a week, so a second release that week is skipped. This never fails a release:
// every problem ends as a GitHub Actions warning and exit code 0.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ENDPOINT = "https://toolradar.com/api/mcp";
const SLUG = "flisk-cli";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TITLE_MAX = 80;
const SUMMARY_MIN = 40;
const SUMMARY_MAX = 280;

// Plain text for one changelog bullet: no markdown links, code ticks, emphasis or PR numbers.
export function plainText(markdown) {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*]/g, "")
    .replace(/\s*\(#\d+\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function changelogBullets(changelog, version) {
  const lines = changelog.split("\n");
  const start = lines.findIndex(
    (line) => line.startsWith(`## ${version} `) || line === `## ${version}`,
  );
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end))
    .filter((line) => line.startsWith("- "))
    .map((line) => plainText(line.slice(2)))
    .filter(Boolean);
}

function firstSentence(text) {
  return text.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? text;
}

// The first sentence of each bullet, in order, as many as fit. Null when there is too little to post.
export function buildPost(version, bullets) {
  if (bullets.length === 0) return null;
  let summary = "";
  for (const sentence of bullets.map(firstSentence)) {
    const next = summary ? `${summary} ${sentence}` : sentence;
    if (next.length > SUMMARY_MAX) break;
    summary = next;
  }
  if (summary.length < SUMMARY_MIN) return null;
  const headline = firstSentence(bullets[0]).replace(/[.!?]$/, "");
  const withHeadline = `Flisk CLI ${version}: ${headline}`;
  return {
    kind: "update",
    slug: SLUG,
    title: withHeadline.length <= TITLE_MAX ? withHeadline : `Flisk CLI ${version} release notes`,
    summary,
    url: `https://github.com/flisk-sh/flisk/releases/tag/v${version}`,
  };
}

// Toolradar reports `posted` as "Nov 8", with no year: a date that lands in the future belongs to last year.
export function postedRecently(posts, now) {
  return posts.some((post) => {
    if (post.listing !== SLUG || /withdrawn|not published/i.test(post.status ?? "")) return false;
    const posted = new Date(`${post.posted} ${now.getUTCFullYear()} UTC`);
    if (Number.isNaN(posted.getTime())) return false;
    if (posted > now) posted.setUTCFullYear(posted.getUTCFullYear() - 1);
    return now - posted < WEEK_MS;
  });
}

export async function callTool(fetchImpl, apiKey, name, args) {
  const response = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    throw new Error(`${name}: HTTP ${response.status} ${JSON.stringify(body.error ?? body)}`);
  }
  const text = body.result?.content?.[0]?.text ?? "";
  if (body.result?.isError) throw new Error(`${name}: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function run({
  version,
  changelog,
  apiKey,
  fetchImpl = fetch,
  now = new Date(),
  log = console.log,
}) {
  if (!apiKey) return log("TOOLRADAR_API_KEY is not set; not posting.");
  const post = buildPost(version, changelogBullets(changelog, version));
  if (!post)
    return log(`::warning::No usable changelog entry for ${version}; not posting on Toolradar.`);
  try {
    const { posts = [] } = await callTool(fetchImpl, apiKey, "list_my_posts", {});
    if (postedRecently(posts, now))
      return log(`Toolradar already has a post this week; skipping ${version}.`);
    await callTool(fetchImpl, apiKey, "post_update", post);
    await callTool(fetchImpl, apiKey, "post_update", { ...post, confirm: true });
    log(`Posted on Toolradar: ${post.title}`);
  } catch (error) {
    log(`::warning::Could not post ${version} on Toolradar: ${error.message}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await run({
    version: JSON.parse(readFileSync("package.json", "utf8")).version,
    changelog: readFileSync("docs/CHANGELOG.md", "utf8"),
    apiKey: process.env.TOOLRADAR_API_KEY,
  });
}
