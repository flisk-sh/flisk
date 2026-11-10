#!/usr/bin/env node
// Posts a released version's changelog in the Discord releases channel, called by release-binaries.yml once the
// release is public. Never fails a release: every problem ends as a GitHub Actions warning and exit code 0.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { changelogBullets } from "./post-toolradar-update.mjs";

const API = "https://discord.com/api/v10";
const MAX_BULLETS = 8;
const BULLET_MAX = 220;
const CONTENT_MAX = 1900;

function clip(text) {
  return text.length <= BULLET_MAX ? text : `${text.slice(0, BULLET_MAX - 1).trimEnd()}…`;
}

// A Discord message for one version. Null when the changelog has no entry for it.
export function buildMessage(version, bullets) {
  if (bullets.length === 0) return null;
  const lines = bullets.slice(0, MAX_BULLETS).map((bullet) => `- ${clip(bullet)}`);
  const footer = [
    `Notes and binaries: <https://github.com/flisk-sh/releases/releases/tag/v${version}>`,
    "Upgrade with `flisk upgrade`, or run `npx @flisk-sh/flisk`.",
  ].join("\n");
  let content = `**Flisk CLI ${version} is out**\n\n${lines.join("\n")}\n\n${footer}`;
  while (content.length > CONTENT_MAX && lines.length > 1) {
    lines.pop();
    content = `**Flisk CLI ${version} is out**\n\n${lines.join("\n")}\n\n${footer}`;
  }
  return content;
}

// Bullets from a GitHub release body's "Pull requests" list, for releases whose changelog entry is not written yet.
export function releaseNoteBullets(body) {
  const lines = (body ?? "").split("\n");
  const start = lines.findIndex((line) => /^##\s+Pull requests/i.test(line));
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end))
    .filter((line) => line.startsWith("- "))
    .map((line) =>
      line
        .slice(2)
        .replace(/:\s*\[#\d+\]\([^)]*\).*$/, "")
        .replace(/^\w+(\([^)]*\))?!?:\s*/, "")
        .replace(/`/g, "")
        .trim(),
    )
    .filter(Boolean);
}

export async function run({
  version,
  changelog,
  token,
  channelId,
  fetchImpl = fetch,
  log = console.log,
}) {
  if (!token || !channelId) return log("Discord token or channel is not set; not posting.");
  let bullets = changelogBullets(changelog, version);
  if (bullets.length === 0) {
    try {
      const res = await fetchImpl(
        `https://api.github.com/repos/flisk-sh/releases/releases/tags/v${version}`,
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (res.ok) bullets = releaseNoteBullets((await res.json()).body);
    } catch {}
  }
  const content = buildMessage(version, bullets);
  if (!content) return log(`::warning::No changelog entry for ${version}; not posting on Discord.`);
  try {
    const headers = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
    const url = `${API}/channels/${channelId}/messages`;
    const recent = await fetchImpl(`${url}?limit=50`, { headers });
    if (recent.ok) {
      const messages = await recent.json();
      if (messages.some((m) => m.content?.startsWith(`**Flisk CLI ${version} is out**`)))
        return log(`Discord already has a post for ${version}; skipping.`);
    }
    const response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ content, allowed_mentions: { parse: [] }, flags: 4 }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${await response.text()}`);
    log(`Posted ${version} in the Discord releases channel.`);
  } catch (error) {
    log(`::warning::Could not post ${version} on Discord: ${error.message}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await run({
    version: process.env.RELEASE_VERSION || JSON.parse(readFileSync("package.json", "utf8")).version,
    changelog: readFileSync("docs/CHANGELOG.md", "utf8"),
    token: process.env.DISCORD_BOT_TOKEN,
    channelId: process.env.DISCORD_RELEASES_CHANNEL_ID,
  });
}
