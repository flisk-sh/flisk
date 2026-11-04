// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for scripts/docs/fit.mjs: the score matches flisk.sh/fit, and every page links to the pages one answer away.
//   node --test scripts/docs/fit.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT, gaugeSvg, plan, reasons, RUNTIMES, SETUPS, SIZES, score, serviceScore, teamScore, verdict } from "./fit.mjs";

const pick = (runtime, setup, size) => ({
  runtime: RUNTIMES.find((r) => r.slug === runtime),
  setup: SETUPS.find((s) => s.slug === setup),
  size: SIZES.find((s) => s.slug === size),
});
const total = ({ runtime, setup, size }) => score(runtime, setup, size).total;

test("the default answers score 82%, as on flisk.sh/fit (Node/TS/Bun, Compose, 8 services, 2 pains, 10 developers)", () => {
  assert.equal(total(DEFAULT), 82);
  assert.equal(score(DEFAULT.runtime, DEFAULT.setup, DEFAULT.size).cap, null);
  assert.equal(verdict(82).name, "Great fit");
});

test("the services and team curves are the website's", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 60].map(serviceScore), [4, 8, 12, 16, 20, 20]);
  assert.deepEqual([1, 4, 5, 9, 10, 29, 30].map(teamScore), [6, 6, 10, 10, 14, 14, 16]);
  assert.deepEqual([75, 74, 45, 44].map((n) => verdict(n).name), ["Great fit", "Could fit", "Could fit", "Not a fit yet"]);
});

test("one part is called out as not a fit, and every page lists the same assumptions", () => {
  const one = reasons(RUNTIMES[0], SETUPS[0], SIZES[0]);
  assert.ok(one.some(([mark, text]) => mark === "no" && /One part/.test(text)));
  assert.ok(one.some(([, text]) => /not measured savings/.test(text)));
});

test("162 pages, each with three bars whose tabs link to existing pages, and a gauge per distinct score", () => {
  const { assets, pages, section } = plan();
  assert.equal(pages.size, RUNTIMES.length * SETUPS.length * SIZES.length);
  for (const [file, text] of pages) {
    const links = [...text.matchAll(/<a href="([^"]+\.md)"><img/g)].map((m) => `docs/fit/${m[1]}`);
    assert.equal(links.length, RUNTIMES.length + SETUPS.length + SIZES.length, file);
    for (const link of links) assert.ok(pages.has(link), `${file} links to missing ${link}`);
    assert.ok(links.includes(file), `${file} links to itself from its selected tabs`);
    const img = /score-(\d+)\.[0-9a-f]{8}\.svg/.exec(text);
    assert.ok(img && [...assets.keys()].some((a) => a.includes(`score-${img[1]}.`)), file);
  }
  assert.match(section, /^<!-- fit · generated[\s\S]*<!-- \/fit -->$/);
  assert.match(section, /score-82\./);
});

test("the gauge fills to the score, honors reduced motion and rests filled without animation", () => {
  const svg = gaugeSvg(82);
  const c = Number(/stroke-dasharray:([\d.]+)/.exec(svg)[1]);
  const rest = Number(/stroke-dashoffset:([\d.]+);animation/.exec(svg)[1]);
  assert.ok(Math.abs(rest - c * 0.18) < 0.05);
  assert.match(svg, /prefers-reduced-motion:reduce/);
  assert.match(svg, /aria-label="82% fit score: Great fit"/);
});

test("the verdict never contradicts the reasons: 1 part is never a fit, 2-4 parts never a great fit", () => {
  for (const runtime of RUNTIMES) {
    for (const setup of SETUPS) {
      assert.ok(total({ runtime, setup, size: SIZES[0] }) <= 40, `${runtime.slug}/${setup.slug}/1`);
      assert.equal(verdict(total({ runtime, setup, size: SIZES[0] })).name, "Not a fit yet");
      assert.notEqual(verdict(total({ runtime, setup, size: SIZES[1] })).name, "Great fit");
    }
  }
  const capped = score(...Object.values(pick("node", "kubernetes", "1")));
  assert.deepEqual([capped.raw, capped.total, capped.cap.limit], [70, 40, 40]);
});

test("weights follow what the CLI ships: Python and Go have scaffolds, native processes run without Docker", () => {
  assert.ok(total(pick("python", "compose", "5-plus")) > total(pick("jvm", "compose", "5-plus")));
  assert.equal(total(pick("go", "compose", "5-plus")), total(pick("python", "compose", "5-plus")));
  assert.equal(total(pick("node", "native", "5-plus")), 82, "native processes fit as well as Compose");
  assert.ok(reasons(...Object.values(pick("python", "compose", "5-plus"))).some(([, text]) => /--language python/.test(text)));
});

test("every page shows how its score adds up, with the assumed rows marked", () => {
  const { pages } = plan();
  for (const [file, text] of pages) {
    assert.match(text, /\*\*How the score adds up\*\*/, file);
    assert.match(text, /\| Pains \(we assumed\) \|/, file);
    const shown = Number(/\| \*\*Score\*\* \| \| \*\*(\d+)%\*\* \|/.exec(text)[1]);
    assert.match(text, new RegExp(`score-${shown}\\.`), `${file}: gauge shows the table's score`);
  }
});
