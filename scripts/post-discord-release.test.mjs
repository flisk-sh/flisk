import assert from "node:assert/strict";
import test from "node:test";
import { buildMessage, releaseNoteBullets, run } from "./post-discord-release.mjs";

const CHANGELOG = `# Changelog

## 1.4.50 (2026-11-20)

- Fixed \`flisk up\` for [mixed projects](https://x.test) (#3374). More detail.
- Added Scoop install.

## 1.4.49 (2026-11-08)

- Older entry.
`;

test("buildMessage lists bullets and links the release", () => {
  const msg = buildMessage("1.4.50", ["Fixed a thing.", "Added a thing."]);
  assert.match(msg, /^\*\*Flisk CLI 1\.4\.50 is out\*\*/);
  assert.match(msg, /- Fixed a thing\./);
  assert.match(msg, /<https:\/\/github\.com\/flisk-sh\/releases\/releases\/tag\/v1\.4\.50>/);
});

test("buildMessage returns null with no bullets and stays under the Discord limit", () => {
  assert.equal(buildMessage("1.0.0", []), null);
  const many = Array.from({ length: 30 }, () => "x".repeat(500));
  assert.ok(buildMessage("1.0.0", many).length <= 2000);
});

test("run posts once, with mentions disabled", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    return init.method === "POST"
      ? { ok: true, text: async () => "" }
      : { ok: true, json: async () => [] };
  };
  const logs = [];
  await run({ version: "1.4.50", changelog: CHANGELOG, token: "t", channelId: "c", fetchImpl, log: (m) => logs.push(m) });
  const post = calls.find((c) => c.init.method === "POST");
  assert.equal(post.init.headers.Authorization, "Bot t");
  assert.deepEqual(JSON.parse(post.init.body).allowed_mentions, { parse: [] });
});

test("run skips a version already posted, and never throws", async () => {
  const posted = async () => ({ ok: true, json: async () => [{ content: "**Flisk CLI 1.4.50 is out**\nx" }] });
  const logs = [];
  await run({ version: "1.4.50", changelog: CHANGELOG, token: "t", channelId: "c", fetchImpl: posted, log: (m) => logs.push(m) });
  assert.match(logs[0], /already has a post/);
  await run({ version: "1.4.50", changelog: CHANGELOG, token: "t", channelId: "c", fetchImpl: async () => { throw new Error("boom"); }, log: (m) => logs.push(m) });
  assert.match(logs.at(-1), /::warning::Could not post/);
});

test("run does nothing without credentials", async () => {
  const logs = [];
  await run({ version: "1.4.50", changelog: CHANGELOG, fetchImpl: async () => { throw new Error("no"); }, log: (m) => logs.push(m) });
  assert.match(logs[0], /not set/);
});

test("releaseNoteBullets reads the Pull requests list", () => {
  const body = "## Flisk CLI 1.4.50\n\n## Pull requests\n\n- fix(up): reload a Bun backend: [#1](https://x/1) (@a)\n- docs: add a thing: [#2](https://x/2) (@b)\n\n## Contributors\n- @a";
  assert.deepEqual(releaseNoteBullets(body), ["reload a Bun backend", "add a thing"]);
});

test("run falls back to the release notes when the changelog has no entry", async () => {
  const body = "## Pull requests\n\n- fix: one: [#1](https://x/1) (@a)\n";
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push(url);
    if (new URL(url).hostname === "api.github.com") return { ok: true, json: async () => ({ body }) };
    return init.method === "POST" ? { ok: true, text: async () => "" } : { ok: true, json: async () => [] };
  };
  await run({ version: "9.9.9", changelog: CHANGELOG, token: "t", channelId: "c", fetchImpl, log: () => {} });
  assert.ok(calls.some((u) => new URL(u).pathname.endsWith("/channels/c/messages")));
});
