import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPost,
  changelogBullets,
  plainText,
  postedRecently,
  run,
} from "./post-toolradar-update.mjs";

const NOW = new Date("2026-11-20T12:00:00Z");
const CHANGELOG = `# Changelog

## Unreleased

## 1.4.44 (2026-11-20)

- Fixed \`flisk up\` for [mixed projects](https://x.test) (#3374). More detail here.
- Added a much longer second entry about bring-your-own stacks and when they start.

## 1.4.43 (2026-11-08)

- Older entry.
`;

function fakeToolradar(posts, failOn) {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const { params } = JSON.parse(init.body);
    calls.push({ ...params, auth: init.headers.Authorization });
    if (failOn === params.name) {
      return Response.json({ result: { isError: true, content: [{ text: "refused" }] } });
    }
    const text =
      params.name === "list_my_posts" ? JSON.stringify({ posts }) : JSON.stringify({ ok: true });
    return Response.json({ result: { content: [{ text }] } });
  };
  return { calls, fetchImpl };
}

function execute(options) {
  const logs = [];
  return run({
    version: "1.4.44",
    changelog: CHANGELOG,
    apiKey: "key",
    now: NOW,
    log: (line) => logs.push(line),
    ...options,
  }).then(() => logs);
}

test("plainText drops markdown and PR numbers", () => {
  assert.equal(plainText("Fixed `a` in [b](https://x.test) (#12)."), "Fixed a in b.");
});

test("changelogBullets reads only the requested version", () => {
  const bullets = changelogBullets(CHANGELOG, "1.4.44");
  assert.equal(bullets.length, 2);
  assert.equal(changelogBullets(CHANGELOG, "9.9.9").length, 0);
});

test("buildPost stays inside Toolradar's limits", () => {
  const post = buildPost("1.4.44", ["x".repeat(200) + ". Rest.", "y".repeat(200) + "."]);
  assert.ok(post.title.length <= 80);
  assert.ok(post.summary.length <= 280);
  assert.equal(post.url, "https://github.com/flisk-sh/flisk/releases/tag/v1.4.44");
  assert.equal(buildPost("1.4.44", ["Short."]), null);
});

test("postedRecently covers the week, the year boundary and withdrawn posts", () => {
  const post = (posted, status = "Live", listing = "flisk-cli") => ({ posted, status, listing });
  assert.equal(postedRecently([post("Nov 18")], NOW), true);
  assert.equal(postedRecently([post("Nov 8")], NOW), false);
  assert.equal(postedRecently([post("Nov 18", "Withdrawn")], NOW), false);
  assert.equal(postedRecently([post("Nov 18", "Live", "pages")], NOW), false);
  assert.equal(postedRecently([post("Dec 30")], new Date("2027-01-02T00:00:00Z")), true);
});

test("run previews, then confirms", async () => {
  const { calls, fetchImpl } = fakeToolradar([]);
  await execute({ fetchImpl });
  assert.deepEqual(
    calls.map((call) => [call.name, call.arguments.confirm]),
    [
      ["list_my_posts", undefined],
      ["post_update", undefined],
      ["post_update", true],
    ],
  );
  assert.equal(calls[0].auth, "Bearer key");
});

test("run skips when this week's post is used", async () => {
  const { calls, fetchImpl } = fakeToolradar([
    { listing: "flisk-cli", status: "Live", posted: "Nov 18" },
  ]);
  await execute({ fetchImpl });
  assert.equal(calls.length, 1);
});

test("a refused preview warns and never confirms or throws", async () => {
  const { calls, fetchImpl } = fakeToolradar([], "post_update");
  const logs = await execute({ fetchImpl });
  assert.equal(calls.length, 2);
  assert.match(logs[0], /^::warning::.*refused/);
});

test("run does nothing without a key", async () => {
  const { calls, fetchImpl } = fakeToolradar([]);
  await execute({ fetchImpl, apiKey: "" });
  assert.equal(calls.length, 0);
});
