// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Replays every saved FALSIFIER finding against the built CLI. status "fixed" must pass; status "open" must still fail, so the day
// someone fixes it this test says to flip the fixture to "fixed".
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { makeLab } from "../lib/lab.mjs";
import { PROPERTIES } from "../lib/properties.mjs";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../regressions");
const fixtures = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => [f, JSON.parse(readFileSync(path.join(dir, f), "utf8"))]);

test("FALSIFIER regressions", { timeout: 300_000 }, () => {
  const lab = makeLab();
  try {
    for (const [file, fx] of fixtures) {
      const result = PROPERTIES.find((p) => p.id === fx.property).run(fx.minimized, lab);
      lab.sweep();
      if (fx.status === "fixed") assert.equal(result, null, `${file} regressed: ${result?.actual}`);
      else assert.ok(result, `${file} is marked open but now passes; set its status to "fixed"`);
    }
  } finally { lab.dispose(); }
});
