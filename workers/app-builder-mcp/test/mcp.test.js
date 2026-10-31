import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { TOOLS } from "../src/mcp.js";

globalThis.caches ??= { default: { async match() {}, async put() {}, async delete() {} } };

const env = { PUBLIC_ORIGIN: "https://mcp.flisk.sh" };
const post = (body, init = {}) =>
  worker.fetch(
    new Request("https://mcp.flisk.sh/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body), ...init }),
    env,
    { waitUntil() {} },
  );
const call = async (name, args, id = 1) => (await post({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } })).json();
const text = (r) => JSON.parse(r.result.content[0].text);

test("initialize names the server and offers tools only", async () => {
  const res = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.result.serverInfo.name, "flisk-app-builder");
  assert.deepEqual(body.result.capabilities, { tools: {} });
});

test("both tools are read-only and carry a plain title", async () => {
  const body = await (await post({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
  assert.deepEqual(body.result.tools.map((t) => t.name), ["plan_app", "list_app_starters"]);
  for (const t of TOOLS) {
    assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.equal(t.annotations.openWorldHint, false, t.name);
    assert.ok(t.annotations.title, t.name);
  }
});

test("plan_app answers in everyday words and gives runnable npx commands", async () => {
  const out = text(await call("plan_app", { what: "an online shop with login and a worker" }));
  assert.match(out.you_get, /the website people see/);
  assert.equal(out.start_here, "npx @flisk-sh/flisk demo");
  assert.ok(out.steps.length > 3);
  for (const step of out.steps) assert.match(step, /^npx @flisk-sh\/flisk /, step);
  assert.ok(!out.steps.some((s) => s.includes("npm install")), "no global install step");
  assert.equal(out.or_start_from_a_ready_made_app, undefined, "shop and login match two starters, so none is offered");
});

test("plan_app offers a ready-made app when exactly one kind matches", async () => {
  const out = text(await call("plan_app", { what: "an online shop" }));
  assert.equal(out.or_start_from_a_ready_made_app.kind, "Online shop");
  assert.match(out.or_start_from_a_ready_made_app.repo, /^https:\/\/github\.com\/flisk-sh\//);
});

test("plan_app rejects a missing or too short description", async () => {
  for (const what of [undefined, "", "ab", "x".repeat(601)]) {
    const r = await call("plan_app", { what });
    assert.equal(r.result.isError, true, String(what).slice(0, 8));
    assert.equal(text(r).error, "bad_input");
  }
});

test("list_app_starters lists the ready-made apps with their words", async () => {
  const out = text(await call("list_app_starters", {}));
  assert.ok(out.starters.length >= 4);
  assert.ok(out.starters.some((s) => s.kind === "Online shop" && s.say_something_like.includes("shop")));
  assert.equal(out.start_here, "npx @flisk-sh/flisk demo");
});

test("unknown tools and methods get JSON-RPC errors, notifications get 202", async () => {
  assert.equal((await call("nope", {})).error.code, -32602);
  const m = await (await post({ jsonrpc: "2.0", id: 3, method: "resources/list" })).json();
  assert.equal(m.error.code, -32601);
  const n = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(n.status, 202);
});

test("only POST is accepted, with CORS for the preflight", async () => {
  const get = await worker.fetch(new Request("https://mcp.flisk.sh/mcp"), env, { waitUntil() {} });
  assert.equal(get.status, 405);
  const opt = await worker.fetch(new Request("https://mcp.flisk.sh/mcp", { method: "OPTIONS" }), env, { waitUntil() {} });
  assert.equal(opt.status, 204);
  assert.equal(opt.headers.get("access-control-allow-origin"), "*");
  assert.equal((await post("not json")).status, 400);
});

test("the icons the directory looks for are served as real images", async () => {
  for (const [path, type] of [["/favicon.ico", "image/x-icon"], ["/icon-512.png", "image/png"], ["/apple-touch-icon.png", "image/png"], ["/icon.svg", "image/svg+xml"]]) {
    const res = await worker.fetch(new Request(`https://mcp.flisk.sh${path}`), env, { waitUntil() {} });
    assert.equal(res.status, 200, path);
    assert.equal(res.headers.get("content-type"), type, path);
    assert.ok((await res.arrayBuffer()).byteLength > 100, path);
  }
  assert.equal((await worker.fetch(new Request("https://mcp.flisk.sh/health"), env, { waitUntil() {} })).status, 200);
  assert.equal((await worker.fetch(new Request("https://mcp.flisk.sh/nope"), env, { waitUntil() {} })).status, 404);
});

// An in-memory stand-in for the Cache API, so the per-IP counters can be checked.
function withCache(fn) {
  return async () => {
    const store = new Map();
    const saved = globalThis.caches;
    globalThis.caches = { default: { async match(r) { const v = store.get(r.url); return v === undefined ? undefined : new Response(v); }, async put(r, res) { store.set(r.url, await res.text()); } } };
    try {
      await fn();
    } finally {
      globalThis.caches = saved;
    }
  };
}
const asIp = (ip, body) => new Request("https://mcp.flisk.sh/mcp", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify(body) });

test("a caller over the per-minute cap gets 429 with retry-after, and others are not affected", withCache(async () => {
  const e = { MAX_CALLS_PER_IP_MINUTE: "3", MAX_CALLS_PER_IP_HOUR: "300" };
  const ping = (ip) => worker.fetch(asIp(ip, { jsonrpc: "2.0", id: 1, method: "ping" }), e, { waitUntil() {} });
  for (let i = 0; i < 3; i += 1) assert.equal((await ping("1.1.1.1")).status, 200, `call ${i + 1}`);
  const over = await ping("1.1.1.1");
  assert.equal(over.status, 429);
  assert.equal(over.headers.get("retry-after"), "60");
  assert.equal((await over.json()).error, "rate_limited");
  assert.equal((await ping("2.2.2.2")).status, 200, "another address is fine");
}));

test("the per-hour cap holds even when the minute cap is not reached", withCache(async () => {
  const e = { MAX_CALLS_PER_IP_MINUTE: "100", MAX_CALLS_PER_IP_HOUR: "2" };
  const ping = () => worker.fetch(asIp("3.3.3.3", { jsonrpc: "2.0", id: 1, method: "ping" }), e, { waitUntil() {} });
  await ping();
  await ping();
  const over = await ping();
  assert.equal(over.status, 429);
  assert.equal(over.headers.get("retry-after"), "3600");
}));

test("a request body far larger than any real message is refused", async () => {
  const res = await worker.fetch(new Request("https://mcp.flisk.sh/mcp", { method: "POST", headers: { "content-type": "application/json", "content-length": "99999" }, body: "{}" }), env, { waitUntil() {} });
  assert.equal(res.status, 413);
});

test("GET, preflight and the icons are not counted", withCache(async () => {
  const e = { MAX_CALLS_PER_IP_MINUTE: "1", MAX_CALLS_PER_IP_HOUR: "1" };
  for (let i = 0; i < 5; i += 1) assert.equal((await worker.fetch(new Request("https://mcp.flisk.sh/favicon.ico", { headers: { "cf-connecting-ip": "4.4.4.4" } }), e, { waitUntil() {} })).status, 200);
  assert.equal((await worker.fetch(new Request("https://mcp.flisk.sh/mcp", { method: "OPTIONS" }), e, { waitUntil() {} })).status, 204);
}));
