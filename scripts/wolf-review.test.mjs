// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MARKER,
  MAX_FILES,
  changedServiceJson,
  renderComment,
  reviewFile,
  stripFences,
} from "./wolf-review.mjs";

const reply = (content, ok = true, status = 200) => async () => ({
  ok,
  status,
  json: async () => ({ choices: [{ message: { content } }] }),
});
const args = (fetchImpl, content = '{"name":"api","port":3000}') => ({
  path: "services/api/service.json",
  content,
  diff: "+ port",
  url: "https://x/v1",
  key: "k",
  fetchImpl,
});

describe("changedServiceJson", () => {
  it("keeps only service.json files and caps the count", () => {
    const many = Array.from({ length: 9 }, (_, i) => `s${i}/service.json`);
    assert.deepEqual(changedServiceJson(["a.ts", "svc/service.json", "service.jsonc"]), ["svc/service.json"]);
    assert.equal(changedServiceJson(many).length, MAX_FILES);
  });
});

describe("stripFences", () => {
  it("removes code fences", () => {
    assert.equal(stripFences('```json\n{"a":1}\n```'), '{"a":1}');
  });
});

describe("reviewFile", () => {
  it("is ok when Wolf returns the same JSON, whatever the spacing", async () => {
    const r = await reviewFile(args(reply('{ "port": 3000, "name": "api" }')));
    assert.equal(r.status, "ok");
  });
  it("suggests when Wolf changes the file", async () => {
    const r = await reviewFile(args(reply('```json\n{"name":"api","port":3001}\n```')));
    assert.equal(r.status, "suggest");
    assert.match(r.suggestion, /3001/);
  });
  it("is unusable when the answer is not JSON", async () => {
    assert.equal((await reviewFile(args(reply("looks fine to me")))).status, "unusable");
  });
  it("reports an HTTP error and a thrown error without throwing", async () => {
    assert.equal((await reviewFile(args(reply("", false, 429)))).detail, "HTTP 429");
    const boom = async () => {
      throw new Error("down");
    };
    assert.equal((await reviewFile(args(boom))).status, "error");
  });
});

describe("renderComment", () => {
  it("carries the marker and says so when nothing changed", () => {
    const body = renderComment([{ path: "a/service.json", status: "ok" }]);
    assert.ok(body.startsWith(MARKER));
    assert.match(body, /found nothing to change/);
  });
  it("shows suggestions, skipped files and the M1K3 block", () => {
    const body = renderComment(
      [
        { path: "a/service.json", status: "suggest", suggestion: '{"x":1}' },
        { path: "b/service.json", status: "unusable" },
      ],
      "M1K3 says ok",
    );
    assert.match(body, /Wolf suggests/);
    assert.match(body, /Not reviewed: `b\/service.json`/);
    assert.match(body, /M1K3 \(local\) second opinion/);
  });
});
