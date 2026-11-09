// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  badgeImage,
  badgeMarkdown,
  DONE,
  discordClient,
  FOUNDING_SEATS,
  parseRegistry,
  prLinks,
  REFUSED,
  renderRegistry,
  run,
  WAITING,
} from "./discord-founding-role.mjs";

const OWNER = "owner";
const FOUNDING = "role-founding";
const CONTRIBUTOR = "role-contributor";
const url = (n, repo = "flisk") => `https://github.com/flisk-sh/${repo}/pull/${n}`;
const post = (id, author, content, extra = {}) => ({ id, type: 0, author: { id: author }, content, ...extra });
const marked = (emoji) => ({ reactions: [{ me: true, emoji: { name: emoji } }] });
const merged = (login, type = "User", author_association = "CONTRIBUTOR") => ({
  merged_at: "2026-11-09T00:00:00Z",
  user: { login, type },
  author_association,
});
const open = (login) => ({ merged_at: null, user: { login, type: "User" } });
const seat = (n, github, discord, extra = {}) => ({ n, github, discord, pr: `flisk#${n}`, at: "2026-11-09", ...extra });

// Records what the bot did, so each case can assert the exact side effects.
function setup({ messages, pulls = {}, members = {}, entries = [] }) {
  const calls = { grants: [], replies: [], reactions: [], saved: [], refreshed: 0 };
  const discord = {
    guild: async () => ({
      owner_id: OWNER,
      roles: [
        { id: FOUNDING, name: "Founding Contributor" },
        { id: CONTRIBUTOR, name: "Flisk Contributor" },
      ],
    }),
    messages: async () => messages,
    member: async (id) => (id in members ? members[id] : { roles: [] }),
    grant: async (user, role) => calls.grants.push([user, role]),
    reply: async (id, text, image) => calls.replies.push([id, text, image]),
    react: async (id, emoji) => calls.reactions.push([id, emoji]),
  };
  const github = {
    pull: async (repo, n) => {
      const pull = pulls[`${repo}#${n}`] ?? (repo === "flisk" ? pulls[n] : undefined);
      if (pull instanceof Error) throw pull;
      return pull ? { number: n, ...pull } : null;
    },
    readRegistry: async () => entries,
    saveRegistry: async (next) => calls.saved.push(next.map((e) => [e.n, e.github])),
    refreshHallOfFame: async () => {
      calls.refreshed++;
    },
  };
  return { calls, go: () => run({ discord, github, log: () => {} }) };
}

test("prLinks finds each org PR once and ignores other owners", () => {
  const text = `${url(7)} again ${url(7)}, ${url(9, "fliskos")}, https://github.com/other/repo/pull/9`;
  assert.deepEqual(prLinks(text), [
    { repo: "flisk", number: 7 },
    { repo: "fliskos", number: 9 },
  ]);
  assert.deepEqual(prLinks(undefined), []);
});

test("the first claim gets seat 1, the role, the badge and an explanation", async () => {
  const { calls, go } = setup({ messages: [post("m1", "ann", url(7))], pulls: { 7: merged("ann-gh") } });
  await go();
  assert.deepEqual(calls.saved, [[[1, "ann-gh"]]]);
  assert.deepEqual(calls.grants, [["ann", FOUNDING]]);
  const [, text, image] = calls.replies[0];
  assert.match(text, /You are Founding Contributor #1 of 100!/);
  assert.match(text, /flisk#7 by `ann-gh` merged/);
  assert.match(text, /What this is:/);
  assert.match(text, /<#\d+>/);
  assert.match(text, /For your CV:/);
  assert.match(text, /Founding seats left: \*\*99 of 100\*\*/);
  assert.match(image, /^https:\/\/raster\.shields\.io\//);
  assert.deepEqual(calls.reactions, [["m1", DONE]]);
  assert.equal(calls.refreshed, 1);
});

test("a FliskOS PR earns a seat too", async () => {
  const { calls, go } = setup({
    messages: [post("m1", "ann", url(9, "fliskos"))],
    pulls: { "fliskos#9": merged("ann-gh") },
  });
  await go();
  assert.deepEqual(calls.saved, [[[1, "ann-gh"]]]);
  assert.match(calls.replies[0][1], /fliskos#9 by/);
});

test("seats follow claim order, oldest message first", async () => {
  const { calls, go } = setup({
    messages: [post("m1", "ann", url(7)), post("m2", "bob", url(8))],
    pulls: { 7: merged("ann-gh"), 8: merged("bob-gh") },
    entries: [seat(1, "first", "f"), seat(2, "second", "s")],
  });
  await go();
  assert.deepEqual(
    calls.saved.map((s) => s.at(-1)),
    [
      [3, "ann-gh"],
      [4, "bob-gh"],
    ],
  );
});

test("seat 101 gets the Flisk Contributor badge and role", async () => {
  const entries = Array.from({ length: FOUNDING_SEATS }, (_, i) => seat(i + 1, `p${i}`, `d${i}`));
  const { calls, go } = setup({ messages: [post("m1", "ann", url(7))], pulls: { 7: merged("ann-gh") }, entries });
  await go();
  assert.deepEqual(calls.grants, [["ann", CONTRIBUTOR]]);
  assert.match(calls.replies[0][1], /You are Flisk Contributor #101!/);
  assert.doesNotMatch(calls.replies[0][1], /seats left/);
});

test("a message marked before seats existed gets its number and keeps the role", async () => {
  const { calls, go } = setup({
    messages: [post("m1", "ann", url(7), marked(DONE))],
    pulls: { 7: merged("ann-gh") },
    members: { ann: { roles: [FOUNDING] } },
  });
  await go();
  assert.deepEqual(calls.saved, [[[1, "ann-gh"]]]);
  assert.deepEqual(calls.grants, []);
  assert.match(calls.replies[0][1], /#1 of 100/);
});

test("someone with a seat who posts again gets their badge again, not a new number", async () => {
  const { calls, go } = setup({
    messages: [post("m1", "ann", url(8))],
    pulls: { 8: merged("ann-gh") },
    members: { ann: { roles: [FOUNDING] } },
    entries: [seat(5, "ann-gh", "ann")],
  });
  await go();
  assert.deepEqual(calls.saved, []);
  assert.deepEqual(calls.grants, []);
  assert.match(calls.replies[0][1], /already hold \*\*Founding Contributor #5 of 100/);
  assert.deepEqual(calls.reactions, [["m1", DONE]]);
});

test("a seat whose role grant was lost gets the role back on retry", async () => {
  const { calls, go } = setup({
    messages: [post("m1", "ann", url(8))],
    pulls: { 8: merged("ann-gh") },
    entries: [seat(5, "ann-gh", "ann")],
  });
  await go();
  assert.deepEqual(calls.grants, [["ann", FOUNDING]]);
});

test("a revoked seat is refused quietly", async () => {
  const { calls, go } = setup({
    messages: [post("m1", "ann", url(8))],
    pulls: { 8: merged("ann-gh") },
    entries: [seat(5, "ann-gh", "ann", { revoked: true })],
  });
  await go();
  assert.deepEqual(calls.replies, []);
  assert.deepEqual(calls.reactions, [["m1", REFUSED]]);
});

test("a message already handled and registered is left alone", async () => {
  const { calls, go } = setup({
    messages: [post("m1", "ann", url(7), marked(DONE))],
    pulls: { 7: merged("ann-gh") },
    entries: [seat(1, "ann-gh", "ann")],
  });
  await go();
  assert.deepEqual(calls.replies, []);
  assert.deepEqual(calls.reactions, []);
});

test("a waiting message is left alone", async () => {
  const { calls, go } = setup({
    messages: [post("m1", "ann", url(7), marked(WAITING))],
    pulls: { 7: merged("ann-gh") },
  });
  await go();
  assert.deepEqual(calls.reactions, []);
});

test("an open PR gets no seat and is asked to come back", async () => {
  const { calls, go } = setup({ messages: [post("m1", "ann", url(7))], pulls: { 7: open("ann-gh") } });
  await go();
  assert.deepEqual(calls.saved, []);
  assert.match(calls.replies[0][1], /flisk#7 has not merged yet/);
  assert.deepEqual(calls.reactions, [["m1", WAITING]]);
});

test("a GitHub account can only be claimed once", async () => {
  const { calls, go } = setup({
    messages: [post("m1", "ann", url(7)), post("m2", "bob", url(8))],
    pulls: { 7: merged("ann-gh"), 8: merged("ann-gh") },
  });
  await go();
  assert.deepEqual(calls.grants, [["ann", FOUNDING]]);
  assert.match(calls.replies[1][1], /already been claimed/);
  assert.deepEqual(calls.reactions[1], ["m2", REFUSED]);
});

for (const [name, pull] of [
  ["maintainer", merged("odykyi")],
  ["org member", merged("someone", "User", "MEMBER")],
  ["bot", merged("renovate", "Bot")],
  ["deleted account", { merged_at: "2026-11-09T00:00:00Z", user: null }],
  ["missing", undefined],
]) {
  test(`a ${name} PR does not earn a seat`, async () => {
    const { calls, go } = setup({ messages: [post("m1", "ann", url(7))], pulls: { 7: pull } });
    await go();
    assert.deepEqual(calls.saved, []);
    assert.match(calls.replies[0][1], /could not find a merged community PR/);
    assert.deepEqual(calls.reactions, [["m1", REFUSED]]);
  });
}

test("bots, webhooks, the owner and plain chat are ignored", async () => {
  const { calls, go } = setup({
    messages: [
      post("m1", "b", url(7), { author: { id: "b", bot: true } }),
      post("m2", "w", url(7), { webhook_id: "hook" }),
      post("m3", OWNER, url(7)),
      post("m4", "ann", "hello everyone"),
    ],
    pulls: { 7: merged("ann-gh") },
  });
  await go();
  assert.deepEqual(calls.saved, []);
  assert.deepEqual(calls.reactions, []);
});

test("someone who left the server gets no seat", async () => {
  const { calls, go } = setup({
    messages: [post("m1", "ann", url(7))],
    pulls: { 7: merged("ann-gh") },
    members: { ann: null },
  });
  await go();
  assert.deepEqual(calls.saved, []);
  assert.deepEqual(calls.reactions, [["m1", REFUSED]]);
});

test("the seat is saved before the role is granted", async () => {
  const order = [];
  const discord = {
    guild: async () => ({
      owner_id: OWNER,
      roles: [
        { id: FOUNDING, name: "Founding Contributor" },
        { id: CONTRIBUTOR, name: "Flisk Contributor" },
      ],
    }),
    messages: async () => [post("m1", "ann", url(7))],
    member: async () => ({ roles: [] }),
    grant: async () => order.push("grant"),
    reply: async () => order.push("reply"),
    react: async () => order.push("react"),
  };
  const github = {
    pull: async () => ({ number: 7, ...merged("ann-gh") }),
    readRegistry: async () => [],
    saveRegistry: async () => order.push("save"),
    refreshHallOfFame: async () => {},
  };
  await run({ discord, github, log: () => {} });
  assert.deepEqual(order, ["save", "grant", "reply", "react"]);
});

test("blank messages fail loudly because the content intent is off", async () => {
  const { go } = setup({ messages: [post("m1", "ann", "")] });
  await assert.rejects(go, /Message Content Intent/);
});

test("a failing message does not stop later ones, and the run still fails", async () => {
  const { calls, go } = setup({
    messages: [post("m1", "ann", url(7)), post("m2", "bob", url(8))],
    pulls: { 7: new Error("GitHub is down"), 8: merged("bob-gh") },
  });
  await assert.rejects(go, /1 of 2 messages failed/);
  assert.deepEqual(calls.grants, [["bob", FOUNDING]]);
  assert.deepEqual(calls.reactions, [["m2", DONE]]);
});

test("the badge keeps hyphens in a login and links to Discord", () => {
  assert.match(decodeURIComponent(badgeImage(3, "AK-Lmn")), /message=#3 of 100 • @AK-Lmn/);
  assert.doesNotMatch(badgeImage(3, "AK-Lmn"), /\+/);
  assert.match(badgeMarkdown(3, "AK-Lmn"), /\(https:\/\/discord\.gg\/qMu5Xn8Kaq\)$/);
  assert.match(decodeURIComponent(badgeImage(101, "ann")), /FLISK CONTRIBUTOR.*message=#101 • @ann/);
});

test("the registry survives a round trip through the issue body", () => {
  const entries = [seat(1, "ann-gh", "ann"), seat(2, "bob-gh", "bob", { revoked: true })];
  const body = renderRegistry(entries);
  assert.deepEqual(parseRegistry(body), entries);
  assert.match(body, /2 of 100 Founding seats claimed/);
  assert.match(body, /\| 1 \| @ann-gh \|/);
  assert.doesNotMatch(body, /\| 2 \| @bob-gh \|/);
  assert.deepEqual(parseRegistry("no data"), []);
});

test("a rate limit without a JSON body falls back to the default wait", async () => {
  const slept = [];
  const responses = [new Response("slow down", { status: 429 }), new Response(null, { status: 204 })];
  const client = discordClient("t", {
    fetchImpl: async () => responses.shift(),
    sleep: async (ms) => slept.push(ms),
  });
  assert.equal(await client.grant("ann", FOUNDING), true);
  assert.deepEqual(slept, [1000]);
});

test("run as a script without a token, it warns and exits cleanly", () => {
  const script = fileURLToPath(new URL("discord-founding-role.mjs", import.meta.url));
  const { DISCORD_BOT_TOKEN: _token, ...env } = process.env;
  const result = spawnSync(process.execPath, [script], { env, encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /DISCORD_BOT_TOKEN is not set/);
});

test("the client waits out a rate limit and retries", async () => {
  const slept = [];
  const responses = [
    new Response(JSON.stringify({ retry_after: 0.5 }), { status: 429 }),
    new Response(null, { status: 204 }),
  ];
  const client = discordClient("t", {
    fetchImpl: async () => responses.shift(),
    sleep: async (ms) => slept.push(ms),
  });
  assert.equal(await client.grant("ann", FOUNDING), true);
  assert.deepEqual(slept, [500]);
});

test("replies only ping the person replied to and can carry the badge image", async () => {
  let sent;
  const client = discordClient("t", {
    fetchImpl: async (_url, init) => {
      sent = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: "r" }), { status: 200 });
    },
  });
  await client.reply("m1", "hello", "https://raster.shields.io/x");
  assert.deepEqual(sent.allowed_mentions, { parse: [], replied_user: true });
  assert.equal(sent.message_reference.message_id, "m1");
  assert.deepEqual(sent.embeds, [{ image: { url: "https://raster.shields.io/x" } }]);
});
