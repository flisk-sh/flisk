import assert from "node:assert/strict";
import { test } from "node:test";
import worker, { startBot, startCilytics } from "../src/index.js";

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

test("the run at minute 18 (the first on the 3-minute timer from 17) also runs the level sync", async () => {
  const { calls, fetchImpl } = recorder();
  await startBot(at(18), "tok", fetchImpl);
  assert.deepEqual(calls[0].body.inputs, { claims_only: "false" });
});

test("exactly one run an hour runs the level sync", async () => {
  let syncs = 0;
  for (let minute = 0; minute < 60; minute += 3) {
    const { calls, fetchImpl } = recorder();
    await startBot(at(minute), "tok", fetchImpl);
    if (calls[0].body.inputs.claims_only === "false") syncs++;
  }
  assert.equal(syncs, 1);
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

test("Cilytics starts exactly once an hour, on its main branch", async () => {
  const starts = [];
  for (let minute = 0; minute < 60; minute += 3) {
    const { calls, fetchImpl } = recorder();
    if (await startCilytics(at(minute), "tok", fetchImpl)) starts.push({ minute, call: calls[0] });
    else assert.equal(calls.length, 0);
  }
  assert.equal(starts.length, 1);
  assert.equal(starts[0].minute, 18);
  assert.match(starts[0].call.url, /repos\/flisk-sh\/cilytics\/actions\/workflows\/cilytics\.yml\/dispatches$/);
  assert.deepEqual(starts[0].call.body, { ref: "main" });
});

test("a Cilytics error fails its own promise with the status", async () => {
  const { fetchImpl } = recorder(404, "Not Found");
  await assert.rejects(startCilytics(at(18), "tok", fetchImpl), /GitHub answered 404: Not Found/);
});

for (const [minute, expected] of [[3, 1], [18, 2]]) {
  test(`the scheduled handler waits for every start at minute ${minute}`, async () => {
    const waited = [];
    const urls = [];
    const real = globalThis.fetch;
    globalThis.fetch = async (url) => { urls.push(url); return new Response(null, { status: 204 }); };
    try {
      worker.scheduled(
        { scheduledTime: at(minute) },
        { GITHUB_DISPATCH_TOKEN: "tok" },
        { waitUntil: (promise) => waited.push(promise) },
      );
      assert.equal(waited.length, 2);
      await Promise.all(waited);
      assert.equal(urls.length, expected);
    } finally {
      globalThis.fetch = real;
    }
  });
}

test("a failing Cilytics start does not stop the bot", async () => {
  const waited = [];
  const urls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    urls.push(url);
    return url.includes("cilytics") ? new Response("Not Found", { status: 404 }) : new Response(null, { status: 204 });
  };
  try {
    worker.scheduled({ scheduledTime: at(18) }, { GITHUB_DISPATCH_TOKEN: "tok" }, { waitUntil: (p) => waited.push(p) });
    const results = await Promise.allSettled(waited);
    assert.deepEqual(results.map((r) => r.status), ["fulfilled", "rejected"]);
    assert.equal(urls.filter((u) => u.includes("discord-founding-role")).length, 1);
  } finally {
    globalThis.fetch = real;
  }
});
