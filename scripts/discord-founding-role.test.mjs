// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DONE, discordClient, prLinks, REFUSED, run, WAITING } from "./discord-founding-role.mjs";

const OWNER = "owner";
const ROLE = "role-1";
const url = (n) => `https://github.com/flisk-sh/flisk/pull/${n}`;
const post = (id, author, content, extra = {}) => ({ id, type: 0, author: { id: author }, content, ...extra });
const marked = (emoji) => ({ reactions: [{ me: true, emoji: { name: emoji } }] });
const merged = (login, type = "User") => ({ merged_at: "2026-11-09T00:00:00Z", user: { login, type } });
const open = (login) => ({ merged_at: null, user: { login, type: "User" } });

// Records what the bot did, so each case can assert the exact side effects.
function setup({ messages, pulls = {}, members = {} }) {
  const calls = { grants: [], replies: [], reactions: [] };
  const discord = {
    guild: async () => ({ owner_id: OWNER, roles: [{ id: ROLE, name: "Founding Contributor" }] }),
    messages: async () => messages,
    member: async (id) => (id in members ? members[id] : { roles: [] }),
    grant: async (user, role) => calls.grants.push([user, role]),
    reply: async (id, text) => calls.replies.push([id, text]),
    react: async (id, emoji) => calls.reactions.push([id, emoji]),
  };
  const github = {
    pull: async (n) => {
      if (pulls[n] instanceof Error) throw pulls[n];
      return pulls[n] ? { number: n, ...pulls[n] } : null;
    },
  };
  return { calls, go: () => run({ discord, github, log: () => {} }) };
}

test("prLinks finds each flisk PR once and ignores other repos", () => {
  const text = `${url(7)} and again ${url(7)}, ${url(8)}, https://github.com/other/repo/pull/9`;
  assert.deepEqual(prLinks(text), [7, 8]);
  assert.deepEqual(prLinks(undefined), []);
});

test("a merged PR grants the role and the reply says what it gives", async () => {
  const { calls, go } = setup({ messages: [post("m1", "ann", url(7))], pulls: { 7: merged("ann-gh") } });
  await go();
  assert.deepEqual(calls.grants, [["ann", ROLE]]);
  assert.equal(calls.replies.length, 1);
  assert.match(calls.replies[0][1], /#7 by `ann-gh` merged/);
  assert.match(calls.replies[0][1], /blue name and your own group at the top of the member list/);
  assert.deepEqual(calls.reactions, [["m1", DONE]]);
});

test("someone who already has the role is marked without a second reply", async () => {
  const { calls, go } = setup({
    messages: [post("m1", "ann", url(7))],
    pulls: { 7: merged("ann-gh") },
    members: { ann: { roles: [ROLE] } },
  });
  await go();
  assert.deepEqual(calls.grants, []);
  assert.deepEqual(calls.replies, []);
  assert.deepEqual(calls.reactions, [["m1", DONE]]);
});

test("a message the bot already handled is left alone", async () => {
  const { calls, go } = setup({
    messages: [post("m1", "ann", url(7), marked(WAITING))],
    pulls: { 7: merged("ann-gh") },
  });
  await go();
  assert.deepEqual(calls, { grants: [], replies: [], reactions: [] });
});

test("an open PR gets no role and is asked to come back", async () => {
  const { calls, go } = setup({ messages: [post("m1", "ann", url(7))], pulls: { 7: open("ann-gh") } });
  await go();
  assert.deepEqual(calls.grants, []);
  assert.match(calls.replies[0][1], /#7 has not merged yet/);
  assert.deepEqual(calls.reactions, [["m1", WAITING]]);
});

test("a PR counts only for the first person to post it", async () => {
  const { calls, go } = setup({
    messages: [post("m1", "ann", url(7)), post("m2", "bob", url(7))],
    pulls: { 7: merged("ann-gh") },
  });
  await go();
  assert.deepEqual(calls.grants, [["ann", ROLE]]);
  assert.match(calls.replies[1][1], /#7 already earned/);
  assert.deepEqual(calls.reactions, [
    ["m1", DONE],
    ["m2", REFUSED],
  ]);
});

test("a PR claimed in an earlier run stays claimed", async () => {
  const { calls, go } = setup({
    messages: [post("m1", "ann", url(7), marked(DONE)), post("m2", "bob", url(7))],
    pulls: { 7: merged("ann-gh") },
  });
  await go();
  assert.deepEqual(calls.grants, []);
  assert.deepEqual(calls.reactions, [["m2", REFUSED]]);
});

for (const [name, pull] of [
  ["maintainer", merged("odykyi")],
  ["bot", merged("renovate", "Bot")],
  ["deleted account", { merged_at: "2026-11-09T00:00:00Z", user: null }],
  ["missing", undefined],
]) {
  test(`a ${name} PR does not earn the role`, async () => {
    const { calls, go } = setup({ messages: [post("m1", "ann", url(7))], pulls: { 7: pull } });
    await go();
    assert.deepEqual(calls.grants, []);
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
  assert.deepEqual(calls, { grants: [], replies: [], reactions: [] });
});

test("someone who left the server is marked without a reply", async () => {
  const { calls, go } = setup({
    messages: [post("m1", "ann", url(7))],
    pulls: { 7: merged("ann-gh") },
    members: { ann: null },
  });
  await go();
  assert.deepEqual(calls.grants, []);
  assert.deepEqual(calls.replies, []);
  assert.deepEqual(calls.reactions, [["m1", REFUSED]]);
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
  assert.deepEqual(calls.grants, [["bob", ROLE]]);
  assert.deepEqual(calls.reactions, [["m2", DONE]]);
});

test("a rate limit without a JSON body falls back to the default wait", async () => {
  const slept = [];
  const responses = [new Response("slow down", { status: 429 }), new Response(null, { status: 204 })];
  const client = discordClient("t", {
    fetchImpl: async () => responses.shift(),
    sleep: async (ms) => slept.push(ms),
  });
  assert.equal(await client.grant("ann", ROLE), true);
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
  assert.equal(await client.grant("ann", ROLE), true);
  assert.deepEqual(slept, [500]);
});

test("replies never ping anyone but the person replied to", async () => {
  let sent;
  const client = discordClient("t", {
    fetchImpl: async (_url, init) => {
      sent = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: "r" }), { status: 200 });
    },
  });
  await client.reply("m1", "hello");
  assert.deepEqual(sent.allowed_mentions, { parse: [], replied_user: true });
  assert.equal(sent.message_reference.message_id, "m1");
});
