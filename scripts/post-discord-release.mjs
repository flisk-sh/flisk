#!/usr/bin/env node
// Posts a released version's changelog in the Discord releases channel, called by release-binaries.yml once the
// release is public. Never fails a release: every problem ends as a GitHub Actions warning and exit code 0.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { githubClient } from "./discord-founding-role.mjs";
import { changelogBullets } from "./post-toolradar-update.mjs";

const API = "https://discord.com/api/v10";
const MAX_BULLETS = 8;
const BULLET_MAX = 220;
const CONTENT_MAX = 1900;

function clip(text) {
  return text.length <= BULLET_MAX ? text : `${text.slice(0, BULLET_MAX - 1).trimEnd()}…`;
}

const BOTS = /\[bot\]$|^(dependabot|github-actions|renovate)$/i;

// Who to tag: the Discord account when the GitHub login is in the Founding registry, else the GitHub profile link.
function person(login, people) {
  const id = people.get(login.toLowerCase());
  return id ? `<@${id}>` : `[@${login}](https://github.com/${login})`;
}

// A Discord message for one version. Null when the changelog has no entry for it.
// An item is a string or { text, logins }; `people` maps a lowercase GitHub login to a Discord user id.
export function buildMessage(version, items, people = new Map()) {
  if (items.length === 0) return null;
  const entries = items.slice(0, MAX_BULLETS).map((item) => {
    const { text, logins = [] } = typeof item === "string" ? { text: item } : item;
    const who = [...new Set(logins)].filter((l) => !BOTS.test(l));
    return { line: `- ${clip(text)}${who.length ? ` (${who.map((l) => person(l, people)).join(", ")})` : ""}`, who };
  });
  const footer = [
    `Notes and binaries: <https://github.com/flisk-sh/releases/releases/tag/v${version}>`,
    "Upgrade with `flisk upgrade`, or run `npx @flisk-sh/flisk`.",
  ].join("\n");
  const compose = () => {
    const thanks = [...new Set(entries.flatMap((e) => e.who))];
    const thanksLine = thanks.length
      ? `Huge thanks to ${thanks.map((l) => person(l, people)).join(", ")} for shipping this release! 💜\n\n`
      : "";
    return `**Flisk CLI ${version} is out**\n\n${entries.map((e) => e.line).join("\n")}\n\n${thanksLine}${footer}`;
  };
  let content = compose();
  while (content.length > CONTENT_MAX && entries.length > 1) {
    entries.pop();
    content = compose();
  }
  return content;
}

function changelogRawBullets(changelog, version) {
  const lines = changelog.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## ${version} `) || l === `## ${version}`);
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
}

// Authors and PR numbers from a GitHub release body: "- fix: text: [#12](url) (@login)" lines.
export function releasePulls(body) {
  const lines = (body ?? "").split("\n");
  const start = lines.findIndex((line) => /^##\s+Pull requests/i.test(line));
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end))
    .filter((line) => line.startsWith("- "))
    .map((line) => ({
      number: Number(/\[#(\d+)\]/.exec(line)?.[1]) || null,
      login: /\(@([\w-]+(?:\[bot\])?)\)\s*$/.exec(line)?.[1] ?? null,
    }));
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
  githubToken,
  fetchImpl = fetch,
  log = console.log,
  loadRegistry = () => githubClient(githubToken, { fetchImpl }).readRegistry(),
}) {
  if (!token || !channelId) return log("Discord token or channel is not set; not posting.");
  let notes = "";
  try {
    const res = await fetchImpl(
      `https://api.github.com/repos/flisk-sh/releases/releases/tags/v${version}`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (res.ok) notes = (await res.json()).body ?? "";
  } catch {}
  const authors = new Map(releasePulls(notes).filter((p) => p.number && p.login).map((p) => [p.number, p.login]));
  const raw = changelogRawBullets(changelog, version);
  const texts = changelogBullets(changelog, version);
  let items = texts.map((text, i) => ({
    text,
    // plainText drops the "(#123)" refs, so read them from the matching raw line when the lists line up.
    logins: [...(raw.length === texts.length ? raw[i] : text).matchAll(/#(\d+)/g)]
      .map((m) => authors.get(Number(m[1])))
      .filter(Boolean),
  }));
  if (items.length === 0) {
    const pulls = releasePulls(notes);
    items = releaseNoteBullets(notes).map((text, i) => ({ text, logins: pulls[i]?.login ? [pulls[i].login] : [] }));
  }
  const people = new Map();
  try {
    for (const e of await loadRegistry()) if (e.discord) people.set(e.github.toLowerCase(), e.discord);
  } catch (error) {
    log(`::warning::Could not read the Discord contributor map: ${error.message}`);
  }
  const content = buildMessage(version, items, people);
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
      body: JSON.stringify({ content, allowed_mentions: { parse: [], users: [...new Set(content.match(/(?<=<@)\d+(?=>)/g) ?? [])] }, flags: 4 }),
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
    githubToken: process.env.GITHUB_TOKEN,
    channelId: process.env.DISCORD_RELEASES_CHANNEL_ID,
  });
}
