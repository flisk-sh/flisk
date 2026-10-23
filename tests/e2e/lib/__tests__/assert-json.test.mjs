// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../assert-json.mjs", import.meta.url));
const dir = mkdtempSync(path.join(tmpdir(), "assert-json-"));
const file = (name, text) => {
  const full = path.join(dir, name);
  writeFileSync(full, text);
  return full;
};
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

test("envelope accepts one machine envelope and checks its error code", () => {
  const ok = file("ok.json", '{"schemaVersion":1,"data":{"a":1},"errors":[]}\n');
  assert.equal(run("envelope", ok).status, 0);
  const failure = file("fail.json", '{"schemaVersion":1,"data":null,"errors":[{"code":"AGENT_NOT_RUNNING","message":"x"}]}\n');
  assert.equal(run("envelope", failure, "AGENT_NOT_RUNNING").status, 0);
  const other = run("envelope", failure, "NO_PORT");
  assert.equal(other.status, 1);
  assert.match(other.stderr, /expected error code NO_PORT, got AGENT_NOT_RUNNING/);
});

test("envelope rejects extra output, missing fields and failures that carry data", () => {
  const twoLines = run("envelope", file("two.json", '{"schemaVersion":1,"errors":[]}\nWarning: something\n'));
  assert.equal(twoLines.status, 1);
  assert.match(twoLines.stderr, /exactly one line, got 2/);
  assert.match(run("envelope", file("nover.json", '{"errors":[]}\n')).stderr, /no numeric schemaVersion/);
  const withData = file("data.json", '{"schemaVersion":1,"data":{},"errors":[{"code":"X"}]}\n');
  assert.match(run("envelope", withData, "X").stderr, /must have data: null/);
});

test("check evaluates the expression against the parsed file", () => {
  const f = file("check.json", '{"data":{"n":2}}');
  assert.equal(run("check", f, "j.data.n === 2", "n is two").status, 0);
  const failed = run("check", f, "j.data.n === 3", "n is three");
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /n is three/);
  assert.match(run("check", file("bad.json", "not json"), "true", "m").stderr, /is not valid JSON/);
});

test("equal compares parsed JSON, not text", () => {
  const a = file("a.json", '{"x":1,"y":[1,2]}');
  const b = file("b.json", '{ "y": [1, 2], "x": 1 }');
  const c = file("c.json", '{"x":1,"y":[2,1]}');
  assert.equal(run("equal", a, b).status, 0);
  assert.equal(run("equal", a, c).status, 1);
});

test("an unknown command is a usage error", () => {
  assert.equal(run("nope").status, 2);
});
