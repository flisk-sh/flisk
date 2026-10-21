// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import { createServer } from "node:net";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../stub.mjs", import.meta.url));

async function freePort() {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  server.close();
  await once(server, "close");
  return port;
}

async function startStub(...args) {
  const port = await freePort();
  const child = spawn(process.execPath, [script, args[0], String(port), ...args.slice(1)], { stdio: ["ignore", "pipe", "inherit"] });
  let out = "";
  for await (const chunk of child.stdout) {
    out += chunk;
    if (out.includes("listening")) break;
  }
  return { port, stop: () => child.kill("SIGTERM") };
}

function get(port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/session", timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
      res.on("error", () => resolve({ status: res.statusCode, body, aborted: true }));
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ timedOut: true });
    });
    req.on("error", () => {});
  });
}

test("status answers the given code with the message as {error}", async (t) => {
  const stub = await startStub("status", "500", "internal_error");
  t.after(stub.stop);
  const res = await get(stub.port);
  assert.equal(res.status, 500);
  assert.deepEqual(JSON.parse(res.body), { error: "internal_error" });
});

test("json answers 200 with the body verbatim", async (t) => {
  const stub = await startStub("json", '[{"id":"a"}]');
  t.after(stub.stop);
  const res = await get(stub.port);
  assert.equal(res.status, 200);
  assert.equal(res.body, '[{"id":"a"}]');
});

test("hang never answers", async (t) => {
  const stub = await startStub("hang");
  t.after(stub.stop);
  assert.deepEqual(await get(stub.port, 300), { timedOut: true });
});

test("stall sends headers and then never finishes the body", async (t) => {
  const stub = await startStub("stall");
  t.after(stub.stop);
  const res = await new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port: stub.port, path: "/" }, (r) => {
      setTimeout(() => {
        req.destroy();
        resolve({ status: r.statusCode, complete: r.complete });
      }, 300);
      r.resume();
    });
    req.on("error", () => {});
  });
  assert.deepEqual(res, { status: 200, complete: false });
});
