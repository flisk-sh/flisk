// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
//
// Coverage ratchet for the high-risk CLI areas. Reads the JSON-summary written by `bun run test:coverage`, adds up the
// lines and branches of each area's files, and fails when an area is below its recorded baseline in
// cli/coverage-baseline.json. Areas only go up.
//
// Usage (from cli/):
//   node scripts/coverage-ratchet.mjs                     check against the committed baseline
//   node scripts/coverage-ratchet.mjs --update            rewrite the baseline from the current report (review the diff;
//                                                         lowering a number needs its own commit with a reason)
//   --summary <file> / --baseline <file>                  read or write other files (used to test the gate itself)
//
// Exit codes: 0 pass, 1 regression or a bad baseline, 2 the coverage summary is missing or unreadable.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cliDir = fileURLToPath(new URL("..", import.meta.url));

// A file belongs to the first area whose predicate matches its path relative to cli/. Files in no area are not gated.
// Keep the predicates narrow: a new file in a protected area is gated only once it is listed here.
const AREAS = [
  {
    name: "install and update",
    match: (rel) =>
      rel === "src/commands/upgrade.ts" ||
      rel === "src/utils/tdk-version.ts" ||
      rel === "src/utils/bun-floor.ts" ||
      rel === "src/utils/bun-requirement.ts",
  },
  { name: "command implementations", match: (rel) => rel.startsWith("src/commands/") },
  { name: "validation", match: (rel) => rel === "src/utils/validation.ts" },
  {
    name: "discovery",
    match: (rel) =>
      rel === "src/utils/discovery-paths.ts" || rel === "src/utils/discovery-context.ts",
  },
  {
    name: "stack and project handling",
    match: (rel) => /^src\/utils\/(stack|project)-[^/]+\.ts$/.test(rel),
  },
];

const METRICS = ["lines", "branches"];

function parseArgs(argv) {
  const opts = {
    summary: path.join(cliDir, "coverage", "coverage-summary.json"),
    baseline: path.join(cliDir, "coverage-baseline.json"),
    update: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--update") opts.update = true;
    else if (arg === "--summary") opts.summary = path.resolve(argv[++i]);
    else if (arg === "--baseline") opts.baseline = path.resolve(argv[++i]);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

// Round down to two decimals so a baseline never rounds above what the run measured.
function floor2(value) {
  return Math.floor(value * 100) / 100;
}

function pct(covered, total) {
  return total === 0 ? 100 : floor2((covered * 100) / total);
}

// Sums lines and branches per area. The summary is istanbul's json-summary: a `total` entry plus one entry per file,
// keyed by absolute path.
function measureAreas(summary) {
  const totals = Object.fromEntries(AREAS.map((area) => [area.name, { files: 0 }]));
  for (const [file, data] of Object.entries(summary)) {
    if (file === "total") continue;
    const rel = path.relative(cliDir, file).split(path.sep).join("/");
    const area = AREAS.find((candidate) => candidate.match(rel));
    if (!area) continue;
    const bucket = totals[area.name];
    bucket.files += 1;
    for (const metric of METRICS) {
      bucket[`${metric}Covered`] = (bucket[`${metric}Covered`] ?? 0) + data[metric].covered;
      bucket[`${metric}Total`] = (bucket[`${metric}Total`] ?? 0) + data[metric].total;
    }
  }
  return Object.fromEntries(
    AREAS.map((area) => {
      const bucket = totals[area.name];
      const measured = { files: bucket.files };
      for (const metric of METRICS) {
        measured[metric] = pct(bucket[`${metric}Covered`] ?? 0, bucket[`${metric}Total`] ?? 0);
      }
      return [area.name, measured];
    }),
  );
}

function readJson(file, what) {
  if (!existsSync(file)) {
    console.error(
      `coverage-ratchet: ${what} not found at ${file}. Run \`bun run test:coverage\` in cli/ first.`,
    );
    process.exit(2);
  }
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`coverage-ratchet: cannot read ${what} at ${file}: ${error.message}`);
    process.exit(2);
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const summary = readJson(opts.summary, "coverage summary");
  const measured = measureAreas(summary);

  if (opts.update) {
    const areas = Object.fromEntries(
      AREAS.map((area) => [
        area.name,
        Object.fromEntries(METRICS.map((metric) => [metric, measured[area.name][metric]])),
      ]),
    );
    const body = {
      $comment:
        "Per-area coverage floor (percent, rounded down). Checked by scripts/coverage-ratchet.mjs in CI. Raise numbers freely; lower one only in its own commit titled `coverage: lower baseline for <area>` with the reason in the body.",
      areas,
    };
    writeFileSync(opts.baseline, `${JSON.stringify(body, null, 2)}\n`);
    console.log(`coverage-ratchet: wrote ${opts.baseline}`);
    return;
  }

  const baseline = readJson(opts.baseline, "coverage baseline");
  const failures = [];
  const rows = [];

  for (const area of AREAS) {
    const floor = baseline.areas?.[area.name];
    const now = measured[area.name];
    if (!floor) {
      failures.push(
        `area "${area.name}" has no entry in ${path.basename(opts.baseline)}; run with --update to record it`,
      );
      continue;
    }
    if (now.files === 0) {
      failures.push(
        `area "${area.name}" matched no files in the coverage report; did its files move?`,
      );
      continue;
    }
    const cells = [];
    for (const metric of METRICS) {
      const floorValue = floor[metric];
      const actual = now[metric];
      cells.push(`${metric} ${actual.toFixed(2)}% (baseline ${floorValue.toFixed(2)}%)`);
      if (actual < floorValue) {
        const drop = (floorValue - actual).toFixed(2);
        failures.push(
          `area "${area.name}" ${metric} coverage fell to ${actual.toFixed(2)}%, below its baseline ${floorValue.toFixed(2)}% (down ${drop} points)`,
        );
      }
    }
    rows.push(`  ${area.name} (${now.files} files): ${cells.join(", ")}`);
  }

  for (const name of Object.keys(baseline.areas ?? {})) {
    if (!AREAS.some((area) => area.name === name)) {
      failures.push(`baseline names area "${name}", which this script does not define`);
    }
  }

  console.log("coverage-ratchet: per-area coverage");
  console.log(rows.join("\n"));

  if (failures.length > 0) {
    console.error("\ncoverage-ratchet: FAILED");
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(
      "Add tests for the area, or, if the drop is intended, lower its baseline in cli/coverage-baseline.json in its own reviewed commit.",
    );
    process.exit(1);
  }
  console.log("coverage-ratchet: passed");
}

main();
