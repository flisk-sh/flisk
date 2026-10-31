// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for scripts/npm-downloads-graph.mjs.
//   node --test scripts/npm-downloads-graph.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  API,
  PKG,
  fetchDownloads,
  generateSvg,
  main,
  renderGraph,
  renderSvg,
} from "./npm-downloads-graph.mjs";

test("renderSvg generates SVG with ordered series from unordered download rows", () => {
  const unorderedRows = [
    { day: "2026-10-03", downloads: 300 },
    { day: "2026-10-01", downloads: 100 },
    { day: "2026-10-02", downloads: 200 },
  ];

  const svg = renderSvg(unorderedRows);

  // Assert day ordering in polyline coordinates:
  // n = 3, w = 720, h = 220, innerW = 660, innerH = 156, max = 300
  // day 2026-10-01 (100): x(0) = 44.0, y(100) = 28 + 156 - (100/300)*156 = 132.0
  // day 2026-10-02 (200): x(1) = 374.0, y(200) = 28 + 156 - (200/300)*156 = 80.0
  // day 2026-10-03 (300): x(2) = 704.0, y(300) = 28 + 156 - (300/300)*156 = 28.0
  const expectedPoints = "44.0,132.0 374.0,80.0 704.0,28.0";
  assert.ok(
    svg.includes(`points="${expectedPoints}"`),
    `polyline points should match expected chronological coordinates: ${expectedPoints}`
  );

  // Assert axis day labels are rendered in ascending chronological order
  const labels = [...svg.matchAll(/<text[^>]*y="210"[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["10-01", "10-02", "10-03"]);

  // Assert title, total downloads, and date range
  assert.ok(svg.includes(`<title>${PKG} npm downloads 2026-10-01 to 2026-10-03</title>`));
  assert.ok(svg.includes(`${PKG} · 600 npm downloads · 2026-10-01 → 2026-10-03`));
});

test("renderSvg accepts API response object structure and options", () => {
  const data = {
    start: "2026-09-01",
    end: "2026-09-30",
    package: "@flisk-sh/flisk",
    downloads: [
      { day: "2026-09-02", downloads: 50 },
      { day: "2026-09-01", downloads: 25 },
    ],
  };

  const svg = renderSvg(data);
  assert.ok(svg.includes("<title>@flisk-sh/flisk npm downloads 2026-09-01 to 2026-09-30</title>"));
  assert.ok(svg.includes("@flisk-sh/flisk · 75 npm downloads · 2026-09-01 → 2026-09-30"));
  assert.ok(svg.includes('points="44.0,106.0 704.0,28.0"'));

  const labels = [...svg.matchAll(/<text[^>]*y="210"[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["09-01", "09-02"]);
});

test("generateSvg and renderGraph are aliases of renderSvg", () => {
  assert.equal(generateSvg, renderSvg);
  assert.equal(renderGraph, renderSvg);
});

test("renderSvg handles single data point and empty dataset gracefully", () => {
  const single = renderSvg([{ day: "2026-10-15", downloads: 40 }]);
  assert.ok(single.includes('points="374.0,28.0"'));
  assert.ok(single.includes(">10-15</text>"));

  const empty = renderSvg([]);
  assert.ok(empty.includes('points=""'));
  assert.ok(empty.includes("0 npm downloads"));
});

test("fetchDownloads queries the npm registry with expected URL and returns json", async () => {
  const mockPayload = {
    start: "2026-10-01",
    end: "2026-10-02",
    package: PKG,
    downloads: [
      { day: "2026-10-01", downloads: 10 },
      { day: "2026-10-02", downloads: 20 },
    ],
  };

  let calledUrl = null;
  const mockFetch = async (url) => {
    calledUrl = url;
    return {
      ok: true,
      json: async () => mockPayload,
    };
  };

  const result = await fetchDownloads(PKG, mockFetch);
  assert.equal(calledUrl, API);
  assert.deepEqual(result, mockPayload);
});

test("fetchDownloads rejects on HTTP error response", async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 404,
    text: async () => "Not Found",
  });

  await assert.rejects(
    fetchDownloads(PKG, mockFetch),
    /404 Not Found/
  );
});

test("main renders and writes SVG without network access using injected data", async () => {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "flisk-npm-graph-"));
  const outFile = path.join(tmpDir, "test-graph.svg");

  try {
    const fixedData = {
      start: "2026-10-01",
      end: "2026-10-02",
      package: PKG,
      downloads: [
        { day: "2026-10-02", downloads: 80 },
        { day: "2026-10-01", downloads: 40 },
      ],
    };

    const svg = await main({ data: fixedData, out: outFile });
    assert.ok(svg.includes("<svg"));
    const written = readFileSync(outFile, "utf8");
    assert.equal(written, svg);
    assert.ok(written.includes("120 npm downloads"));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("main supports write: false option and fetch injection", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      start: "2026-10-01",
      end: "2026-10-01",
      package: PKG,
      downloads: [{ day: "2026-10-01", downloads: 5 }],
    }),
  });

  const svg = await main({ fetch: mockFetch, write: false });
  assert.ok(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(svg.includes("5 npm downloads"));
});
