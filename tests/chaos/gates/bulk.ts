// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// Bulk gate check: generate service.json sets (valid, and valid with known corruptions), run them through the checks that stop
// `flisk up` before anything starts, and compare each verdict with the known right answer. Nothing touches the disk, so it
// runs millions of cases a minute across worker threads.
//
//   bun gates/bulk.ts --count 10000000 [--seed 1] [--workers 8] [--bad-rate 0.6]
//
// Exit status 1 when a gate crashed, rejected a valid set, or accepted a corrupted one that the gap list below does not cover.
import os from "node:os";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import type { DiscoveredResource } from "../../../cli/src/types/index.js";
import { checkDuplicateResourceNames } from "../../../cli/src/utils/doctor-wiring.js";
import {
  checkCircularDependencies,
  checkDependsOnShape,
  checkServiceFields,
  checkServicePorts,
} from "../../../cli/src/utils/service-config-checks.js";
import { validateServiceManifest } from "../../../cli/src/utils/service-manifest.js";
import { CORRUPTIONS, type Corruption, type Json, makeCase, Rng } from "./generate.js";

const ROOT = "/chaos";

/**
 * Mistakes only `flisk config verify` reports, on purpose: a missing or wrong schemaVersion only warns at `flisk up` (old
 * projects keep working; `flisk config migrate` fixes it), and a file that is not a JSON object is skipped with a warning.
 */
const VERIFY_ONLY_BY_DESIGN: ReadonlySet<Corruption> = new Set(["schemaVersion", "not-an-object"]);

export interface Verdict {
  /** Refused by `flisk up` (its gate: duplicate names, service fields, dependsOn shape, cycles, ports). */
  up: boolean;
  /** Refused by `flisk config verify` (validateServiceManifest on every file, plus the same checks). */
  verify: boolean;
  /** Either of them. */
  rejected: boolean;
  reasons: string[];
}

/** The gates, as `flisk up` and `flisk config verify` apply them to a project's service.json files. */
export function runGates(files: Json[]): Verdict {
  const reasons: string[] = [];
  const upReasons: string[] = [];
  const resources: DiscoveredResource[] = [];
  files.forEach((file, index) => {
    const path = `services/s${index}/service.json`;
    reasons.push(...validateServiceManifest(file, path).errors);
    if (file && typeof file === "object" && !Array.isArray(file)) {
      // Discovery names a service whose appName is not a string after its directory.
      resources.push({
        name: typeof file.appName === "string" ? file.appName : `s${index}`,
        stack: typeof file.stack === "string" ? file.stack : undefined,
        path: `${ROOT}/services/s${index}`,
        configPath: `${ROOT}/${path}`,
        config: file as never,
      });
    }
  });
  for (const check of [
    checkDuplicateResourceNames(ROOT, resources),
    checkServiceFields(ROOT, resources),
    checkDependsOnShape(ROOT, resources),
    checkCircularDependencies(ROOT, resources),
    checkServicePorts(ROOT, resources),
  ]) {
    if (!check.didPass) upReasons.push(check.message);
  }
  reasons.push(...upReasons);
  return {
    up: upReasons.length > 0,
    verify: reasons.length > upReasons.length || upReasons.length > 0,
    rejected: reasons.length > 0,
    reasons,
  };
}

interface Tally {
  cases: number;
  valid: number;
  corrupted: number;
  crashes: number;
  /** Corrupted sets only `config verify` refused, where the corruption is one `flisk up` is meant to refuse too. */
  upMissedUnexpected: number;
  /** A valid set a gate refused. */
  falseRejects: number;
  /** Corrupted sets nothing refused, by the one corruption class that was applied (multi-class cases count under "mixed"). */
  accepted: Record<string, number>;
  /** Corrupted sets `flisk config verify` refused but the `flisk up` gate let through, by class. */
  upMissed: Record<string, number>;
  seen: Record<string, number>;
  examples: Record<string, { seed: number; files: Json[]; reasons: string[] }>;
}

const emptyTally = (): Tally => ({
  cases: 0,
  valid: 0,
  corrupted: 0,
  crashes: 0,
  upMissedUnexpected: 0,
  falseRejects: 0,
  accepted: {},
  upMissed: {},
  seen: {},
  examples: {},
});

function runRange(seedBase: number, from: number, to: number, badRate: number): Tally {
  const tally = emptyTally();
  for (let index = from; index < to; index++) {
    const seed = seedBase + index;
    const made = makeCase(new Rng(seed), badRate);
    tally.cases++;
    const key = made.corruptions.length === 1 ? made.corruptions[0] : "mixed";
    if (made.corruptions.length === 0) tally.valid++;
    else {
      tally.corrupted++;
      tally.seen[key] = (tally.seen[key] ?? 0) + 1;
    }
    let verdict: Verdict;
    try {
      verdict = runGates(made.files);
    } catch (error) {
      tally.crashes++;
      tally.examples.crash ??= { seed, files: made.files, reasons: [String(error)] };
      continue;
    }
    if (made.corruptions.length === 0 && verdict.rejected) {
      tally.falseRejects++;
      tally.examples["false-reject"] ??= { seed, files: made.files, reasons: verdict.reasons };
    }
    if (made.corruptions.length > 0 && verdict.rejected && !verdict.up) {
      tally.upMissed[key] = (tally.upMissed[key] ?? 0) + 1;
      if (!made.corruptions.some((corruption) => VERIFY_ONLY_BY_DESIGN.has(corruption))) {
        tally.upMissedUnexpected++;
        tally.examples[`up-missed:${key}`] ??= {
          seed,
          files: made.files,
          reasons: verdict.reasons,
        };
      }
    }
    if (made.corruptions.length > 0 && !verdict.rejected) {
      tally.accepted[key] = (tally.accepted[key] ?? 0) + 1;
      tally.examples[`accepted:${key}`] ??= { seed, files: made.files, reasons: [] };
    }
  }
  return tally;
}

function merge(into: Tally, from: Tally): void {
  for (const field of [
    "cases",
    "valid",
    "corrupted",
    "crashes",
    "upMissedUnexpected",
    "falseRejects",
  ] as const) {
    into[field] += from[field];
  }
  for (const [key, value] of Object.entries(from.accepted))
    into.accepted[key] = (into.accepted[key] ?? 0) + value;
  for (const [key, value] of Object.entries(from.upMissed))
    into.upMissed[key] = (into.upMissed[key] ?? 0) + value;
  for (const [key, value] of Object.entries(from.seen))
    into.seen[key] = (into.seen[key] ?? 0) + value;
  for (const [key, value] of Object.entries(from.examples)) into.examples[key] ??= value;
}

function argument(name: string, fallback: number): number {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? Number(process.argv[at + 1]) : fallback;
}

if (isMainThread && import.meta.main) {
  const count = argument("count", 1_000_000);
  const seed = argument("seed", 1);
  const badRate = argument("bad-rate", 0.6);
  const workers = argument("workers", Math.max(1, os.availableParallelism() - 1));
  const started = Date.now();
  const total = emptyTally();
  const chunk = Math.ceil(count / workers);
  let finished = 0;
  for (let w = 0; w < workers; w++) {
    const from = w * chunk;
    const to = Math.min(count, from + chunk);
    if (from >= to) {
      finished++;
      continue;
    }
    // Reports every 250k cases so a long run shows progress and a crash loses little.
    const worker = new Worker(new URL(import.meta.url), {
      workerData: { seed, from, to, badRate },
    });
    worker.on("message", (message: { done: boolean; tally: Tally }) => {
      merge(total, message.tally);
      if (message.done && ++finished === workers) report();
    });
    worker.on("error", (error) => {
      console.error(`worker failed: ${error}`);
      process.exit(2);
    });
  }
  if (finished === workers) report();

  function report(): void {
    const seconds = (Date.now() - started) / 1000;
    console.log(
      `cases ${total.cases} in ${seconds.toFixed(1)}s (${Math.round(total.cases / seconds)}/s, ${workers} workers)`,
    );
    console.log(
      `valid ${total.valid}  corrupted ${total.corrupted}  crashes ${total.crashes}  valid-but-refused ${total.falseRejects}  up-gate-misses ${total.upMissedUnexpected}`,
    );
    const rows = [...CORRUPTIONS, "mixed" as const].map((kind) => {
      const k = kind as Corruption | "mixed";
      return `  ${k.padEnd(24)} seen ${String(total.seen[k] ?? 0).padStart(9)}  accepted ${String(total.accepted[k] ?? 0).padStart(9)}  only-verify ${String(total.upMissed[k] ?? 0).padStart(9)}`;
    });
    console.log(
      [
        "corrupted sets by class: accepted by every gate / refused by config verify but not by the flisk up gate:",
        ...rows,
      ].join("\n"),
    );
    for (const [key, example] of Object.entries(total.examples)) {
      console.log(
        `\nexample ${key} (seed ${example.seed}):\n${JSON.stringify(example.files)}\n${example.reasons.slice(0, 3).join("\n")}`,
      );
    }
    const failed =
      total.crashes > 0 ||
      total.falseRejects > 0 ||
      total.upMissedUnexpected > 0 ||
      Object.keys(total.accepted).length > 0;
    process.exit(failed ? 1 : 0);
  }
} else if (!isMainThread) {
  const { seed, from, to, badRate } = workerData as {
    seed: number;
    from: number;
    to: number;
    badRate: number;
  };
  const step = 250_000;
  for (let start = from; start < to; start += step) {
    const end = Math.min(to, start + step);
    parentPort?.postMessage({ done: end === to, tally: runRange(seed, start, end, badRate) });
  }
}
