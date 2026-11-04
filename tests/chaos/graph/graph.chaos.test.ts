// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KNOWN_GAPS, STRICT } from "./invariants.js";
import type { Model } from "./model.js";
import { createWorkspace, type Workspace } from "./project.js";
import { ChaosRun, describeViolations } from "./run.js";
import { applies, INITIAL, SMALL, type Step, stepArbitrary } from "./steps.js";

const hasTilt = spawnSync("tilt", ["version"], { encoding: "utf-8" }).status === 0;
if (process.env.FLISK_REQUIRE_TILT === "1" && !hasTilt) {
  throw new Error("Tilt is required for the dependsOn chaos tests.");
}

const RUNS = Number(process.env.CHAOS_RUNS ?? 4);
const STEPS = Number(process.env.CHAOS_STEPS ?? 10);
const SEED = process.env.CHAOS_SEED ? Number(process.env.CHAOS_SEED) : undefined;
const SHRINK = process.env.CHAOS_SHRINK === "1";
const GAPS = process.env.CHAOS_STRICT === "1" ? STRICT : KNOWN_GAPS;

const SCENARIOS = join(dirname(fileURLToPath(import.meta.url)), "scenarios");

interface Scenario {
  title: string;
  why: string;
  initial?: Model | "wide";
  steps: Step[];
  expect: string[];
}

let workspace: Workspace;
let runs = 0;

class StepCommand implements fc.Command<Model, ChaosRun> {
  constructor(readonly step: Step) {}
  check(model: Readonly<Model>): boolean {
    return applies(model as Model, this.step);
  }
  run(_model: Model, run: ChaosRun): void {
    const found = run.step(this.step);
    if (found.length > 0) throw new Error(failure(run));
  }
  toString(): string {
    return JSON.stringify(this.step);
  }
}

function failure(run: ChaosRun): string {
  return `dependsOn graph violations:\n${describeViolations(run.violations)}\n\nScenario (save under tests/chaos/graph/scenarios/):\n${run.scenario()}`;
}

describe.skipIf(!hasTilt)("dependsOn graph chaos", () => {
  beforeAll(() => {
    workspace = createWorkspace();
  }, 300_000);

  afterAll(() => {
    if (!workspace) return;
    if (process.env.CHAOS_KEEP === "1") console.log(`chaos projects kept in ${workspace.root}`);
    else rmSync(workspace.root, { recursive: true, force: true });
  });

  // Each scenario runs with every gap off and lists the invariants it breaks today. A scenario that stops breaking one means
  // a gap was fixed: drop the id from its `expect` and turn the flag off in KNOWN_GAPS so the random runs guard the fix.
  const files = readdirSync(SCENARIOS)
    .filter((file) => file.endsWith(".json"))
    .sort();
  for (const file of files) {
    const scenario: Scenario = JSON.parse(readFileSync(join(SCENARIOS, file), "utf-8"));
    it(`scenario ${basename(file, ".json")}: ${scenario.title}`, () => {
      const run = new ChaosRun(
        workspace,
        `scenario-${basename(file, ".json")}`,
        scenario.initial === "wide" ? INITIAL : (scenario.initial ?? SMALL),
        STRICT,
      );
      for (const step of scenario.steps) run.step(step);
      const found = [...new Set(run.violations.map((violation) => violation.id))].sort();
      expect(found, describeViolations(run.violations)).toEqual([...scenario.expect].sort());
    }, 600_000);
  }

  // Random edit sequences with the known gaps tolerated, so a failure here is a new way for the graph to go wrong.
  it(`random edit sequences (${RUNS} runs, up to ${STEPS} steps)`, () => {
    fc.assert(
      fc.property(
        fc.commands([stepArbitrary.map((step) => new StepCommand(step))], { maxCommands: STEPS }),
        (commands) => {
          const run = new ChaosRun(workspace, `run${++runs}`, INITIAL, GAPS);
          fc.modelRun(() => ({ model: run.model, real: run }), commands);
          // Always end with a look at the final graph, from the warm project and from a cold copy.
          const [first] = Object.keys(run.model);
          const found = [
            ...run.step({ op: "check", only: first }),
            ...run.step({ op: "coldCheck" }),
          ];
          if (found.length > 0) throw new Error(failure(run));
        },
      ),
      { numRuns: RUNS, seed: SEED, endOnFailure: !SHRINK },
    );
  }, 3_600_000);

  // Not a pass/fail test: runs random sequences with every gap on and reports each distinct violation with the shortest
  // sequence that showed it, so new bugs and regressions of known gaps both show up. CHAOS_SURVEY=1 bun run chaos -t survey
  it.skipIf(process.env.CHAOS_SURVEY !== "1")(
    "survey of violations (every gap on)",
    () => {
      const found = new Map<string, { detail: string; steps: Step[]; count: number }>();
      const sequences = fc.sample(fc.array(stepArbitrary, { minLength: 3, maxLength: STEPS }), {
        numRuns: RUNS,
        seed: SEED,
      });
      for (const [index, sequence] of sequences.entries()) {
        const run = new ChaosRun(workspace, `survey${index}`, INITIAL, STRICT);
        for (const step of sequence) {
          if (!applies(run.model, step)) continue;
          for (const violation of run.step(step)) {
            const seen = found.get(violation.id);
            if (!seen)
              found.set(violation.id, {
                detail: violation.detail,
                steps: [...run.steps],
                count: 1,
              });
            else {
              seen.count++;
              if (run.steps.length < seen.steps.length)
                Object.assign(seen, { detail: violation.detail, steps: [...run.steps] });
            }
          }
        }
        // Always end with a look from the final state.
        const [first] = Object.keys(run.model);
        for (const violation of [
          ...run.step({ op: "check", only: first }),
          ...run.step({ op: "coldCheck" }),
        ]) {
          const seen = found.get(violation.id);
          if (!seen)
            found.set(violation.id, { detail: violation.detail, steps: [...run.steps], count: 1 });
          else seen.count++;
        }
      }
      const report = Object.fromEntries([...found].sort().map(([id, v]) => [id, v]));
      const path = join(tmpdir(), "flisk-chaos-survey.json");
      writeFileSync(path, JSON.stringify(report, null, 2));
      console.log(`SURVEY ${found.size} distinct violations -> ${path}`);
      for (const [id, v] of [...found].sort())
        console.log(`SURVEY ${id} x${v.count}: ${v.detail.split("\n")[0]}`);
    },
    7_200_000,
  );
});
