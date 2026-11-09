#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

// Grants the Founding Contributor role to people who post a merged flisk-sh/flisk
// PR in #start-here, then replies to say so. Runs on a schedule, so it keeps no
// state of its own: the bot's reaction on a message records that it was handled,
// and a merged PR counts for the first person who posts it.

import { fileURLToPath } from "node:url";

const API = "https://discord.com/api/v10";
const GUILD_ID = "1562937840071999538";
const CHANNEL_ID = "1562939740301299733";
const ROLE_NAME = "Founding Contributor";
const REPO = "flisk-sh/flisk";
const MAINTAINERS = new Set(["kburym", "odykyi"]);
const MAX_PAGES = 20;

export const DONE = "✅";
export const WAITING = "⏳";
export const REFUSED = "❌";
const MARKS = [DONE, WAITING, REFUSED];

const NEXT_ISSUES = `https://github.com/${REPO}/issues?q=is%3Aissue+is%3Aopen+no%3Aassignee+label%3A%22good+first+issue%22`;

export function prLinks(content) {
  const found = (content ?? "").matchAll(/https?:\/\/(?:www\.)?github\.com\/flisk-sh\/flisk\/pull\/(\d+)/gi);
  return [...new Set([...found].map((match) => Number(match[1])))];
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

const grantedReply = (prs) =>
  `🎖️ Confirmed: ${prs.map((pr) => `#${pr.number} by \`${pr.user.login}\``).join(", ")} merged. ` +
  `You now have the **${ROLE_NAME}** role: a blue name and your own group at the top of the member list, ` +
  `kept for the people who join this early. Thank you for helping build Flisk!\n\n` +
  `Looking for your next one? <${NEXT_ISSUES}>`;

const waitingReply = (numbers) =>
  `⏳ ${numbers.map((n) => `#${n}`).join(", ")} ${numbers.length === 1 ? "has" : "have"} not merged yet. ` +
  `Post the link here again once it merges and you get the **${ROLE_NAME}** role.`;

const takenReply = (numbers) =>
  `❌ ${numbers.map((n) => `#${n}`).join(", ")} already earned the **${ROLE_NAME}** role for the person who posted it first. ` +
  `If that PR is yours, ask in #help and a maintainer will sort it out.`;

const notEligibleReply = () =>
  `❌ I could not find a merged community PR in that link, so I did not add the **${ROLE_NAME}** role. ` +
  `It needs a merged PR in ${REPO}. If this looks wrong, ask in #help.`;

// Sorts a message's links into what the role decision needs.
async function classify(numbers, authorId, claims, github) {
  const result = { merged: [], open: [], taken: [] };
  for (const number of numbers) {
    const claimedBy = claims.get(number);
    if (claimedBy && claimedBy !== authorId) {
      result.taken.push(number);
      continue;
    }
    const pr = await github.pull(number);
    if (!pr) continue;
    if (!pr.merged_at) result.open.push(number);
    else if (pr.user?.type === "User" && !MAINTAINERS.has(pr.user.login)) result.merged.push(pr);
  }
  return result;
}

async function handle(message, { discord, github, claims, roleId }) {
  const numbers = prLinks(message.content);
  if (numbers.length === 0) return;

  const links = await classify(numbers, message.author.id, claims, github);
  const finish = async (mark, text) => {
    if (text) await discord.reply(message.id, text);
    await discord.react(message.id, mark);
  };

  if (links.merged.length === 0) {
    if (links.open.length > 0) await finish(WAITING, waitingReply(links.open));
    else if (links.taken.length > 0) await finish(REFUSED, takenReply(links.taken));
    else await finish(REFUSED, notEligibleReply());
    return;
  }

  const member = await discord.member(message.author.id);
  if (!member) {
    await finish(REFUSED); // They left the server, so there is nobody to give it to.
    return;
  }
  for (const pr of links.merged) claims.set(pr.number, message.author.id);
  if (member.roles.includes(roleId)) {
    await finish(DONE); // Quiet, so a re-run or a second PR does not repeat the reply.
    return;
  }
  await discord.grant(message.author.id, roleId);
  await finish(DONE, grantedReply(links.merged));
}

export async function run({ discord, github, log = console.log }) {
  const guild = await discord.guild();
  const role = guild.roles.find((r) => r.name === ROLE_NAME);
  if (!role) throw new Error(`The server has no role named ${ROLE_NAME}.`);

  const messages = await discord.messages();
  assertContentVisible(messages);

  const claims = new Map();
  for (const message of messages) {
    if (!hasMark(message, [DONE])) continue;
    for (const number of prLinks(message.content)) claims.set(number, message.author.id);
  }

  const pending = messages.filter(
    (m) => !m.author.bot && !m.webhook_id && m.author.id !== guild.owner_id && !hasMark(m, MARKS),
  );
  // One bad message must not hold up everyone after it. It stays unmarked, so the
  // next run retries it, and the run still goes red so the failure gets seen.
  let failed = 0;
  for (const message of pending) {
    try {
      await handle(message, { discord, github, claims, roleId: role.id });
    } catch (error) {
      failed++;
      log(`::warning::Message ${message.id} failed: ${error.message}`);
    }
  }
  log(`Checked ${messages.length} messages, handled ${pending.length}.`);
  if (failed > 0) throw new Error(`${failed} of ${pending.length} messages failed.`);
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
    react: (messageId, emoji) =>
      call("PUT", `/channels/${CHANNEL_ID}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`),
    reply: (messageId, content) =>
      call("POST", `/channels/${CHANNEL_ID}/messages`, {
        body: {
          content,
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
  return {
    async pull(number) {
      const response = await fetchImpl(`https://api.github.com/repos/${REPO}/pulls/${number}`, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "flisk-discord-founding-role",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`GitHub pull ${number}: ${response.status} ${await response.text()}`);
      return response.json();
    },
  };
}

if (import.meta.main ?? process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.env.DISCORD_BOT_TOKEN) {
    await run({
      discord: discordClient(process.env.DISCORD_BOT_TOKEN),
      github: githubClient(process.env.GITHUB_TOKEN),
    });
  } else {
    console.log("::warning::DISCORD_BOT_TOKEN is not set, so no Founding Contributor roles were granted.");
  }
}
