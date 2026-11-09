#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

// Gives a numbered contributor badge to people who post a merged flisk-sh PR in
// #start-here, grants the matching Discord role and replies with the badge. Runs on
// a schedule. The bot's reaction records that a message was handled, and seat
// numbers live in one GitHub issue so they stay the same forever.

import { fileURLToPath } from "node:url";
import { beltBadge, BELTS, INVITE, MAINTAINER_PATH_PRS, syncLevels, tierBadge, TIERS } from "./discord-contributor-levels.mjs";

const API = "https://discord.com/api/v10";
const GUILD_ID = "1562937840071999538";
const CHANNEL_ID = "1562939740301299733";
const CONTRIBUTORS_CHANNEL_ID = "1569474203944755322";
const FOUNDING_ROLE = "Founding Contributor";
const CONTRIBUTOR_ROLE = "Flisk Contributor";
export const FOUNDING_SEATS = 100;
const ORG = "flisk-sh";
const REPO = `${ORG}/flisk`;
const MAINTAINERS = new Set(["kburym", "odykyi"]);
const MAX_PAGES = 20;

export const REGISTRY_MARK = "<!-- flisk:founding-registry -->";
const REGISTRY_TITLE = "Founding Contributors: the first 100";
const REGISTRY_DATA = /<!-- flisk:founding-data (.*?) -->/s;

export const DONE = "✅";
export const WAITING = "⏳";
export const REFUSED = "❌";
const MARKS = [DONE, WAITING, REFUSED];

const NEXT_ISSUES = `https://github.com/${REPO}/issues?q=is%3Aissue+is%3Aopen+no%3Aassignee+label%3A%22good+first+issue%22`;

export function prLinks(content) {
  const found = (content ?? "").matchAll(/https?:\/\/(?:www\.)?github\.com\/flisk-sh\/([\w.-]+)\/pull\/(\d+)/gi);
  const links = new Map();
  for (const [, repo, number] of found) links.set(`${repo}#${number}`, { repo, number: Number(number) });
  return [...links.values()];
}

const hasMark = (message, marks) => (message.reactions ?? []).some((r) => r.me && marks.includes(r.emoji.name));

// Without the Message Content intent Discord returns every message blank, and the
// bot would look healthy while doing nothing.
function assertContentVisible(messages) {
  const people = messages.filter((m) => !m.author.bot && m.type === 0);
  const blank = (m) => !m.content && !m.embeds?.length && !m.attachments?.length;
  if (people.length > 0 && people.every(blank)) {
    throw new Error("Every message came back blank. Turn on Message Content Intent in the Discord developer portal.");
  }
}

const isFounding = (seat) => seat <= FOUNDING_SEATS;
const badgeTitle = (seat) => (isFounding(seat) ? "Founding Contributor" : "Flisk Contributor");

// The static form of the shields URL takes plain query values, so a hyphen in a login stays a hyphen.
export function badgeImage(seat, login, host = "img.shields.io") {
  const params = new URLSearchParams({
    label: isFounding(seat) ? "⚡ FOUNDING CONTRIBUTOR" : "⚡ FLISK CONTRIBUTOR",
    message: `${isFounding(seat) ? `#${seat} of ${FOUNDING_SEATS}` : `#${seat}`} • @${login}`,
    color: "06b6d4",
    labelColor: "07080f",
    style: "for-the-badge",
  });
  return `https://${host}/static/v1?${params.toString().replaceAll("+", "%20")}`;
}

export function badgeMarkdown(seat, login) {
  return `[![${badgeTitle(seat)} #${seat} @${login}](${badgeImage(seat, login)})](${INVITE})`;
}

const seatLine = (seat) => (isFounding(seat) ? `#${seat} of ${FOUNDING_SEATS}` : `#${seat}`);

const badgeBlock = (seat, login) =>
  `**Add it to your GitHub profile:**\n\`\`\`markdown\n${badgeMarkdown(seat, login)}\n\`\`\`\n` +
  `**For your CV:** \`${badgeTitle(seat)} ${seatLine(seat)}, Flisk (open source), flisk.sh\``;

function grantedReply(seat, pr, seatsTaken) {
  const left = Math.max(FOUNDING_SEATS - seatsTaken, 0);
  const about = isFounding(seat)
    ? `**What this is:** a numbered badge for the first ${FOUNDING_SEATS} people to ship code to Flisk. Yours is permanent, and nobody can earn one once they are gone.`
    : `**What this is:** the numbered badge for people who ship code to Flisk. The first ${FOUNDING_SEATS} went to the Founding Contributors, and you are building on from there.`;
  return [
    `🎖️ **You are ${badgeTitle(seat)} ${seatLine(seat)}!** ${pr.repo}#${pr.number} by \`${pr.user.login}\` merged.`,
    "",
    about,
    "",
    "**What you get**",
    "• Your personal badge, ready for your GitHub profile or CV",
    `• The ${badgeTitle(seat)} role and your own group in the member list`,
    `• Access to <#${CONTRIBUTORS_CHANNEL_ID}>, where contributors talk directly with the maintainers`,
    "",
    badgeBlock(seat, pr.user.login),
    "",
    isFounding(seat) ? `Founding seats left: **${left} of ${FOUNDING_SEATS}**.` : "",
    `Looking for your next one? <${NEXT_ISSUES}>`,
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");
}

const alreadyReply = (entry) =>
  `✅ You already hold **${badgeTitle(entry.n)} ${seatLine(entry.n)}**, one per person. Here it is again:\n\n${badgeBlock(entry.n, entry.github)}`;

const waitingReply = (links) =>
  `⏳ ${links.map((l) => `${l.repo}#${l.number}`).join(", ")} ${links.length === 1 ? "has" : "have"} not merged yet. ` +
  "Post the link here again once it merges and the bot gives you your numbered badge.";

const takenReply = () =>
  "❌ The badge for that GitHub account has already been claimed, and each person gets one. If that account is yours, ask in #help and a maintainer will sort it out.";

const notEligibleReply = () =>
  `❌ I could not find a merged community PR in that link, so there is no badge yet. It needs a merged PR in a ${ORG} repository. If this looks wrong, ask in #help.`;

function isCommunityPr(pr) {
  return (
    pr.user?.type === "User" && !MAINTAINERS.has(pr.user.login) && !["OWNER", "MEMBER"].includes(pr.author_association)
  );
}

// Sorts a message's links into what the badge decision needs.
async function classify(links, authorId, entries, github) {
  const result = { free: [], open: [], taken: false };
  for (const link of links) {
    const pr = await github.pull(link.repo, link.number);
    if (!pr) continue;
    if (!pr.merged_at) {
      result.open.push(link);
    } else if (isCommunityPr(pr)) {
      const owner = entries.find((e) => e.github.toLowerCase() === pr.user.login.toLowerCase());
      if (owner && owner.discord !== authorId) result.taken = true;
      else result.free.push({ ...pr, repo: link.repo });
    }
  }
  return result;
}

async function handle(message, ctx) {
  const { discord, github, entries, roles } = ctx;
  const links = prLinks(message.content);
  if (links.length === 0) return;

  const finish = async (mark, text, image) => {
    if (text) await discord.reply(message.id, text, image);
    await discord.react(message.id, mark);
  };
  const authorId = message.author.id;

  const held = entries.find((e) => e.discord === authorId);
  if (held) {
    if (held.revoked) {
      await finish(REFUSED);
      return;
    }
    const holder = await discord.member(authorId);
    const role = isFounding(held.n) ? roles.founding : roles.contributor;
    if (holder && !holder.roles.includes(role)) await discord.grant(authorId, role);
    await finish(DONE, alreadyReply(held));
    return;
  }

  const result = await classify(links, authorId, entries, github);
  if (result.free.length === 0) {
    if (result.open.length > 0) await finish(WAITING, waitingReply(result.open));
    else if (result.taken) await finish(REFUSED, takenReply());
    else await finish(REFUSED, notEligibleReply());
    return;
  }

  const member = await discord.member(authorId);
  if (!member) {
    await finish(REFUSED); // They left the server, so there is nobody to give it to.
    return;
  }

  const pr = result.free[0];
  const seat = entries.reduce((max, e) => Math.max(max, e.n), 0) + 1;
  const entry = {
    n: seat,
    github: pr.user.login,
    discord: authorId,
    pr: `${pr.repo}#${pr.number}`,
    at: message.timestamp ?? new Date().toISOString(),
  };
  // Saved first, so a crash after this point can never hand the same number to two people.
  await github.saveRegistry([...entries, entry]);
  entries.push(entry);
  ctx.changed = true;

  const role = isFounding(seat) ? roles.founding : roles.contributor;
  if (!member.roles.includes(role)) await discord.grant(authorId, role);
  await finish(DONE, grantedReply(seat, pr, entries.length), badgeImage(seat, pr.user.login, "raster.shields.io"));
}

export async function run({ discord, github, log = console.log }) {
  const guild = await discord.guild();
  const roleId = (name) => {
    const role = guild.roles.find((r) => r.name === name);
    if (!role) throw new Error(`The server has no role named ${name}.`);
    return role.id;
  };
  const roles = { founding: roleId(FOUNDING_ROLE), contributor: roleId(CONTRIBUTOR_ROLE) };

  const messages = await discord.messages();
  assertContentVisible(messages);
  const entries = await github.readRegistry();

  // A message marked done before seats existed still needs its number.
  const needsWork = (m) =>
    !hasMark(m, MARKS) ||
    (hasMark(m, [DONE]) && !hasMark(m, [WAITING, REFUSED]) && !entries.some((e) => e.discord === m.author.id));
  const pending = messages.filter((m) => !m.author.bot && !m.webhook_id && m.author.id !== guild.owner_id && needsWork(m));

  // One bad message must not hold up everyone after it. It stays unmarked, so the
  // next run retries it, and the run still goes red so the failure gets seen.
  const ctx = { discord, github, entries, roles, changed: false };
  let failed = 0;
  for (const message of pending) {
    if (!needsWork(message)) continue; // An earlier message in this run gave this person a seat.
    try {
      await handle(message, ctx);
    } catch (error) {
      failed++;
      log(`::warning::Message ${message.id} failed: ${error.message}`);
    }
  }
  if (ctx.changed) {
    await github.refreshHallOfFame().catch((error) => log(`::warning::Hall of Fame refresh failed: ${error.message}`));
  }
  log(`Checked ${messages.length} messages, handled ${pending.length}, ${entries.length} seats taken.`);
  if (failed > 0) throw new Error(`${failed} of ${pending.length} messages failed.`);
}

const levelCell = ({ tier, belt, github: login }) => {
  const tierLevel = TIERS.find((t) => t.name === tier);
  const beltLevel = BELTS.find((b) => b.name === belt);
  return (
    [
      tierLevel ? `![${tierLevel.role}](${tierBadge(tierLevel, login)})` : "",
      beltLevel ? `![${beltLevel.role}](${beltBadge(beltLevel, login)})` : "",
    ]
      .filter(Boolean)
      .join(" ") || "-"
  );
};

export function renderRegistry(entries) {
  const live = entries.filter((e) => !e.revoked);
  const founding = entries.filter((e) => isFounding(e.n)).length;
  return [
    REGISTRY_MARK,
    `The first ${FOUNDING_SEATS} people to ship code to any ${ORG} repository earn a numbered **Founding Contributor** badge. Seats go in the order people claim them: post a merged PR in [#start-here on Discord](${INVITE}) and the bot does the rest. After that it is a numbered **Flisk Contributor** badge.`,
    "",
    `**${founding} of ${FOUNDING_SEATS} Founding seats claimed.** This issue is updated by the bot.`,
    "",
    "| # | Contributor | Badge | Levels | PR |",
    "| ---: | --- | --- | --- | --- |",
    ...live.map(
      (e) => `| ${e.n} | @${e.github} | ![${badgeTitle(e.n)}](${badgeImage(e.n, e.github)}) | ${levelCell(e)} | ${ORG}/${e.pr} |`,
    ),
    "",
    'Maintainers: to revoke a seat, add `"revoked":true` to its entry in the data comment in this issue\'s source and remove the Discord role. Numbers are never reused.',
    "",
    `<!-- flisk:founding-data ${JSON.stringify(entries)} -->`,
  ].join("\n");
}

export function parseRegistry(body) {
  const match = REGISTRY_DATA.exec(body ?? "");
  return match ? JSON.parse(match[1]) : [];
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function discordClient(token, { fetchImpl = fetch, sleep = wait } = {}) {
  async function call(method, path, { body, allow404 = false } = {}) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await fetchImpl(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
          "User-Agent": `DiscordBot (https://github.com/${REPO}, 1.0)`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.status === 429) {
        const { retry_after: seconds = 1 } = await response.json().catch(() => ({}));
        await sleep(Math.ceil(seconds * 1000));
        continue;
      }
      if (response.status === 404 && allow404) return null;
      if (!response.ok) throw new Error(`Discord ${method} ${path}: ${response.status} ${await response.text()}`);
      return response.status === 204 ? true : response.json();
    }
    throw new Error(`Discord ${method} ${path}: still rate limited after 5 tries`);
  }

  return {
    guild: () => call("GET", `/guilds/${GUILD_ID}`),
    member: (userId) => call("GET", `/guilds/${GUILD_ID}/members/${userId}`, { allow404: true }),
    grant: (userId, roleId) => call("PUT", `/guilds/${GUILD_ID}/members/${userId}/roles/${roleId}`),
    revoke: (userId, roleId) => call("DELETE", `/guilds/${GUILD_ID}/members/${userId}/roles/${roleId}`),
    announce: (content, images, userId) =>
      call("POST", `/channels/${CONTRIBUTORS_CHANNEL_ID}/messages`, {
        body: {
          content,
          embeds: images.map((url) => ({ image: { url } })),
          allowed_mentions: { parse: [], users: [userId] },
        },
      }),
    react: (messageId, emoji) =>
      call("PUT", `/channels/${CHANNEL_ID}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`),
    reply: (messageId, content, image) =>
      call("POST", `/channels/${CHANNEL_ID}/messages`, {
        body: {
          content,
          ...(image ? { embeds: [{ image: { url: image } }] } : {}),
          message_reference: { message_id: messageId, fail_if_not_exists: false },
          allowed_mentions: { parse: [], replied_user: true },
        },
      }),
    // Oldest first, so the first person to post a PR is the one who gets it.
    async messages() {
      const all = [];
      let before = "";
      for (let page = 0; page < MAX_PAGES; page++) {
        const batch = await call("GET", `/channels/${CHANNEL_ID}/messages?limit=100${before}`);
        all.push(...batch);
        if (batch.length < 100) break;
        before = `&before=${batch.at(-1).id}`;
      }
      return all.reverse();
    },
  };
}

export function githubClient(token, { fetchImpl = fetch } = {}) {
  const call = async (method, path, { body, allow404 = false } = {}) => {
    const response = await fetchImpl(`https://api.github.com${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "flisk-discord-founding-role",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 404 && allow404) return null;
    if (!response.ok) throw new Error(`GitHub ${method} ${path}: ${response.status} ${await response.text()}`);
    return response.status === 204 ? true : response.json();
  };

  let registryIssue = null;
  return {
    pull: (repo, number) => call("GET", `/repos/${ORG}/${encodeURIComponent(repo)}/pulls/${number}`, { allow404: true }),
    async readRegistry() {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const issues = await call("GET", `/repos/${REPO}/issues?state=all&labels=community&per_page=100&page=${page}`);
        const found = issues.find((i) => i.body?.includes(REGISTRY_MARK));
        if (found) {
          registryIssue = found.number;
          return parseRegistry(found.body);
        }
        if (issues.length < 100) break;
      }
      return [];
    },
    async saveRegistry(entries) {
      const body = renderRegistry(entries);
      if (registryIssue) {
        await call("PATCH", `/repos/${REPO}/issues/${registryIssue}`, { body: { body } });
      } else {
        const created = await call("POST", `/repos/${REPO}/issues`, {
          body: { title: REGISTRY_TITLE, body, labels: ["community"] },
        });
        registryIssue = created.number;
      }
    },
    // Search counts every flisk-sh repository, the same rule the seats use. Sizes are
    // kept small because each person costs GraphQL points on the hourly sync.
    async mergedWork(login) {
      const query = `query($q:String!,$after:String){search(query:$q,type:ISSUE,first:50,after:$after){
        issueCount pageInfo{hasNextPage endCursor}
        nodes{... on PullRequest{closingIssuesReferences(first:5){nodes{labels(first:20){nodes{name}}}}}}}}`;
      const labels = [];
      let prs = 0;
      let after = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await call("POST", "/graphql", {
          body: { query, variables: { q: `is:pr is:merged author:${login} org:${ORG}`, after } },
        });
        if (result.errors?.length) throw new Error(`GitHub search for ${login}: ${result.errors[0].message}`);
        const { issueCount, pageInfo, nodes } = result.data.search;
        prs = issueCount;
        for (const pr of nodes) {
          for (const issue of pr.closingIssuesReferences?.nodes ?? []) {
            labels.push(...issue.labels.nodes.map((label) => label.name));
          }
        }
        if (!pageInfo.hasNextPage) break;
        after = pageInfo.endCursor;
      }
      return { prs, labels };
    },
    // The profile link does not ping the person: the maintainers decide first.
    flagMaintainerCandidate: (entry, prs, belt) =>
      call("POST", `/repos/${REPO}/issues`, {
        body: {
          title: `Maintainer path: ${entry.github} reached ${MAINTAINER_PATH_PRS} merged PRs`,
          labels: ["community"],
          assignees: [...MAINTAINERS],
          body: [
            `[${entry.github}](https://github.com/${entry.github}) holds contributor seat #${entry.n} and has ${prs} merged PRs across ${ORG}${belt ? `, at ${belt.role}` : ""}.`,
            "",
            `Their work: https://github.com/search?q=${encodeURIComponent(`is:pr is:merged author:${entry.github} org:${ORG}`)}&type=pullrequests`,
            "",
            "Maintainers: decide whether to ask them to review PRs on the way to joining the maintainer team, then close this issue.",
          ].join("\n"),
        },
      }),
    refreshHallOfFame: () =>
      call("POST", `/repos/${REPO}/actions/workflows/hall-of-fame.yml/dispatches`, { body: { ref: "main" } }),
  };
}

if (import.meta.main ?? process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.env.DISCORD_BOT_TOKEN) {
    const job = process.argv[2] === "sync-levels" ? syncLevels : run;
    await job({
      discord: discordClient(process.env.DISCORD_BOT_TOKEN),
      github: githubClient(process.env.GITHUB_TOKEN),
    });
  } else {
    console.log("::warning::DISCORD_BOT_TOKEN is not set, so no Founding Contributor roles were granted.");
  }
}
