import assert from "node:assert/strict";
import test from "node:test";
import { buildMessage, run } from "./post-discord-release.mjs";

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
