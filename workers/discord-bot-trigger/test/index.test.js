import assert from "node:assert/strict";
import { test } from "node:test";
import worker, { startBot } from "../src/index.js";

const at = (minute) => Date.UTC(2026, 10, 9, 10, minute);

function recorder(status = 204, text = "") {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(status === 204 ? null : text, { status });
  };
  return { calls, fetchImpl };
}

test("most minutes only handle claims, on main", async () => {
  const { calls, fetchImpl } = recorder();
  await startBot(at(3), "tok", fetchImpl);
  assert.match(calls[0].url, /workflows\/discord-founding-role\.yml\/dispatches$/);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer tok");
  assert.deepEqual(calls[0].body, { ref: "main", inputs: { claims_only: "true" } });
});

test("minute 17 also runs the level sync", async () => {
  const { calls, fetchImpl } = recorder();
  await startBot(at(17), "tok", fetchImpl);
  assert.deepEqual(calls[0].body.inputs, { claims_only: "false" });
});

test("a missing token fails loudly without calling GitHub", async () => {
  const { calls, fetchImpl } = recorder();
  await assert.rejects(startBot(at(3), undefined, fetchImpl), /GITHUB_DISPATCH_TOKEN is not set/);
  assert.equal(calls.length, 0);
});

test("a GitHub error fails the run with its status", async () => {
  const { fetchImpl } = recorder(403, "nope");
  await assert.rejects(startBot(at(3), "tok", fetchImpl), /GitHub answered 403: nope/);
});

test("the scheduled handler waits for the start to finish", async () => {
  const waited = [];
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 204 });
  try {
    worker.scheduled(
      { scheduledTime: at(3) },
      { GITHUB_DISPATCH_TOKEN: "tok" },
      { waitUntil: (promise) => waited.push(promise) },
    );
    assert.equal(waited.length, 1);
    await waited[0];
  } finally {
    globalThis.fetch = real;
  }
});
