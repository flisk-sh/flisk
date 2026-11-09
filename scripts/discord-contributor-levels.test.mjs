// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import test from "node:test";
import { BELTS, beltBadge, beltFor, levelRoleNames, syncLevels, TIERS, tierBadge, tierFor } from "./discord-contributor-levels.mjs";
import { githubClient, renderRegistry } from "./discord-founding-role.mjs";

const roleOf = (name) => `id:${name}`;
const seat = (n, github, discord, extra = {}) => ({ n, github, discord, pr: `flisk#${n}`, at: "2026-11-09", ...extra });

function setup({ entries, work = {}, members = {}, missingRole, failFor }) {
  const calls = { grants: [], revokes: [], announced: [], saved: 0, flagged: [] };
  const discord = {
    guild: async () => ({
      roles: levelRoleNames()
        .filter((name) => name !== missingRole)
        .map((name) => ({ id: roleOf(name), name })),
    }),
    member: async (id) => (id in members ? members[id] : { roles: [] }),
    grant: async (user, role) => calls.grants.push([user, role]),
    revoke: async (user, role) => calls.revokes.push([user, role]),
    announce: async (text, images, user) => calls.announced.push({ text, images, user }),
  };
  const github = {
    readRegistry: async () => entries,
    saveRegistry: async () => {
      calls.saved++;
    },
    mergedWork: async (login) => {
      if (login === failFor) throw new Error("search down");
      return work[login] ?? { prs: 0, labels: [] };
    },
    flagMaintainerCandidate: async (entry, prs) => calls.flagged.push([entry.github, prs]),
  };
  return { calls, go: () => syncLevels({ discord, github, log: () => {} }) };
}

test("tierFor uses the agreed thresholds", () => {
  assert.equal(tierFor(4), null);
  assert.deepEqual(
    [5, 14, 15, 30, 50, 99, 100, 500].map((prs) => tierFor(prs).name),
    ["Regular", "Regular", "Core", "Veteran", "Elite", "Elite", "Legend", "Legend"],
  );
  assert.deepEqual(TIERS.map((tier) => tier.at), [5, 15, 30, 50, 100]);
});

test("beltFor groups the ranks and takes the hardest", () => {
  const cases = { "8 kyu": "White", "7 kyu": "White", "6 kyu": "Green", "5 kyu": "Green", "4 kyu": "Brown", "1 kyu": "Brown", "1 dan": "Black" };
  for (const [rank, belt] of Object.entries(cases)) assert.equal(beltFor([`rank: ${rank}`]).name, belt, rank);
  assert.equal(beltFor(["rank: 8 kyu", "bug", "rank: 5 kyu"]).name, "Green");
  assert.equal(beltFor(["bug", "rank: unknown"]), null);
  assert.equal(beltFor([]), null);
});

test("badges are static shields that keep hyphens in a login", () => {
  const tier = new URL(tierBadge(TIERS[1], "AK-Lmn"));
  assert.equal(tier.searchParams.get("label"), "FLISK CORE");
  assert.equal(tier.searchParams.get("message"), "15+ merged PRs • @AK-Lmn");
  const belt = new URL(beltBadge(BELTS[3], "AK-Lmn", "raster.shields.io"));
  assert.equal(belt.host, "raster.shields.io");
  assert.equal(belt.searchParams.get("label"), "FLISK BLACK BELT");
});

test("a first sync grants both roles, announces once and saves the levels", async () => {
  const entries = [seat(1, "ann-gh", "ann")];
  const { calls, go } = setup({ entries, work: { "ann-gh": { prs: 6, labels: ["rank: 6 kyu"] } } });
  await go();
  assert.deepEqual(calls.grants, [
    ["ann", roleOf("Flisk Regular")],
    ["ann", roleOf("Green Belt")],
  ]);
  assert.equal(calls.announced.length, 1);
  const { text, images, user } = calls.announced[0];
  assert.equal(user, "ann");
  assert.match(text, /<@ann> levelled up to \*\*Flisk Regular\*\* \(5\+ merged PRs\) and \*\*Green Belt\*\*/);
  assert.match(text, /For your CV:/);
  assert.equal(images.length, 2);
  assert.equal(entries[0].tier, "Regular");
  assert.equal(entries[0].belt, "Green");
  assert.equal(calls.saved, 1);
});

test("a sync with nothing new stays quiet", async () => {
  const entries = [seat(1, "ann-gh", "ann", { tier: "Regular", belt: "Green" })];
  const { calls, go } = setup({
    entries,
    work: { "ann-gh": { prs: 6, labels: ["rank: 6 kyu"] } },
    members: { ann: { roles: [roleOf("Flisk Regular"), roleOf("Green Belt")] } },
  });
  await go();
  assert.deepEqual([calls.grants, calls.revokes, calls.announced, calls.saved], [[], [], [], 0]);
});

test("levelling up swaps the old tier role and mentions only what changed", async () => {
  const entries = [seat(1, "ann-gh", "ann", { tier: "Regular", belt: "Green" })];
  const { calls, go } = setup({
    entries,
    work: { "ann-gh": { prs: 30, labels: ["rank: 6 kyu"] } },
    members: { ann: { roles: [roleOf("Flisk Regular"), roleOf("Green Belt")] } },
  });
  await go();
  assert.deepEqual(calls.revokes, [["ann", roleOf("Flisk Regular")]]);
  assert.deepEqual(calls.grants, [["ann", roleOf("Flisk Veteran")]]);
  assert.match(calls.announced[0].text, /Flisk Veteran/);
  assert.doesNotMatch(calls.announced[0].text, /Green Belt/);
  assert.equal(calls.announced[0].images.length, 1);
});

test("a level never goes down when the data dips", async () => {
  const entries = [seat(1, "ann-gh", "ann", { tier: "Elite", belt: "Black" })];
  const { calls, go } = setup({
    entries,
    work: { "ann-gh": { prs: 2, labels: [] } },
    members: { ann: { roles: [roleOf("Flisk Elite"), roleOf("Black Belt")] } },
  });
  await go();
  assert.deepEqual([calls.grants, calls.revokes, calls.announced], [[], [], []]);
  assert.equal(entries[0].tier, "Elite");
});

test("15 merged PRs flags the person once", async () => {
  const entries = [seat(1, "ann-gh", "ann", { tier: "Core" })];
  const work = { "ann-gh": { prs: 15, labels: [] } };
  const members = { ann: { roles: [roleOf("Flisk Core")] } };
  const first = setup({ entries, work, members });
  await first.go();
  assert.deepEqual(first.calls.flagged, [["ann-gh", 15]]);
  assert.equal(entries[0].maintainerFlagged, true);
  const second = setup({ entries, work, members });
  await second.go();
  assert.deepEqual(second.calls.flagged, []);
});

test("14 merged PRs does not flag anyone", async () => {
  const entries = [seat(1, "ann-gh", "ann")];
  const { calls, go } = setup({ entries, work: { "ann-gh": { prs: 14, labels: [] } } });
  await go();
  assert.deepEqual(calls.flagged, []);
});

test("a revoked seat loses level roles and is not looked up", async () => {
  const entries = [seat(1, "ann-gh", "ann", { revoked: true, tier: "Core" })];
  const { calls, go } = setup({
    entries,
    failFor: "ann-gh",
    members: { ann: { roles: [roleOf("Flisk Core"), "unrelated"] } },
  });
  await go();
  assert.deepEqual(calls.revokes, [["ann", roleOf("Flisk Core")]]);
  assert.deepEqual([calls.grants, calls.announced], [[], []]);
});

test("someone who left the server is skipped without a notice", async () => {
  const entries = [seat(1, "ann-gh", "ann")];
  const { calls, go } = setup({ entries, members: { ann: null }, work: { "ann-gh": { prs: 50, labels: [] } } });
  await go();
  assert.deepEqual([calls.grants, calls.announced, calls.flagged, calls.saved], [[], [], [], 0]);
});

test("one failing seat does not stop the others, and the run still fails", async () => {
  const entries = [seat(1, "bad", "b"), seat(2, "ann-gh", "ann")];
  const { calls, go } = setup({ entries, failFor: "bad", work: { "ann-gh": { prs: 5, labels: [] } } });
  await assert.rejects(go, /1 of 2 seats failed/);
  assert.equal(calls.announced.length, 1);
});

test("a seat holder with zero merged PRs fails the run instead of passing quietly", async () => {
  const entries = [seat(1, "ann-gh", "ann")];
  const { calls, go } = setup({ entries, work: { "ann-gh": { prs: 0, labels: [] } } });
  await assert.rejects(go, /1 of 1 seats failed/);
  assert.deepEqual([calls.grants, calls.announced], [[], []]);
});

test("a missing Discord role stops the sync with its name", async () => {
  const { go } = setup({ entries: [], missingRole: "Black Belt" });
  await assert.rejects(go, /no role named Black Belt/);
});

test("the registry shows earned levels and keeps them in the data", () => {
  const body = renderRegistry([seat(1, "ann-gh", "ann", { tier: "Core", belt: "White" }), seat(2, "bo", "b")]);
  assert.match(body, /!\[Flisk Core\]/);
  assert.match(body, /!\[White Belt\]/);
  assert.match(body, /\| 2 \| @bo \| .* \| - \| flisk-sh\/flisk#2 \|/);
  assert.match(body, /"tier":"Core"/);
});

test("mergedWork pages through search and keeps the total count", async () => {
  const pages = [
    {
      issueCount: 51,
      pageInfo: { hasNextPage: true, endCursor: "c1" },
      nodes: [{ closingIssuesReferences: { nodes: [{ labels: { nodes: [{ name: "rank: 8 kyu" }] } }] } }],
    },
    {
      issueCount: 51,
      pageInfo: { hasNextPage: false, endCursor: "c2" },
      nodes: [{ closingIssuesReferences: { nodes: [{ labels: { nodes: [{ name: "rank: 1 dan" }] } }] } }],
    },
  ];
  const sent = [];
  const client = githubClient("t", {
    fetchImpl: async (_url, init) => {
      sent.push(JSON.parse(init.body).variables);
      return new Response(JSON.stringify({ data: { search: pages.shift() } }), { status: 200 });
    },
  });
  assert.deepEqual(await client.mergedWork("ann-gh"), { prs: 51, labels: ["rank: 8 kyu", "rank: 1 dan"] });
  assert.equal(sent[0].q, "is:pr is:merged author:ann-gh org:flisk-sh");
  assert.equal(sent[1].after, "c1");
});

test("mergedWork reports a GraphQL error instead of counting zero", async () => {
  const client = githubClient("t", {
    fetchImpl: async () => new Response(JSON.stringify({ errors: [{ message: "nope" }] }), { status: 200 }),
  });
  await assert.rejects(client.mergedWork("ann-gh"), /GitHub search for ann-gh: nope/);
});

test("the maintainer flag does not ping the candidate", async () => {
  let sent;
  const client = githubClient("t", {
    fetchImpl: async (_url, init) => {
      sent = JSON.parse(init.body);
      return new Response("{}", { status: 201 });
    },
  });
  await client.flagMaintainerCandidate(seat(3, "ann-gh", "ann"), 16, BELTS[1]);
  assert.match(sent.title, /ann-gh reached 15 merged PRs/);
  assert.deepEqual(sent.assignees.sort(), ["kburym", "odykyi"]);
  assert.doesNotMatch(sent.body, /@ann-gh/);
  assert.match(sent.body, /Green Belt/);
});
