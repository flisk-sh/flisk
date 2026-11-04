// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { check, checkWarmCold, type FrontendEnv, type Gaps, type Violation } from "./invariants.js";
import type { Model } from "./model.js";
import { daemonSnapshot, readFrontendEnv, tiltGraph, upOnly, verify } from "./oracles.js";
import { Project, type Touched, type Workspace } from "./project.js";
import { applies, apply, type Step } from "./steps.js";

/** One project on disk driven by a sequence of steps; every check compares all oracles with the model. */
export class ChaosRun {
  readonly model: Model;
  readonly steps: Step[] = [];
  readonly violations: Violation[] = [];
  private readonly project: Project;
  private touched: Touched[] = [];
  private watched: string[] | null = null;
  private colds = 0;

  constructor(
    workspace: Workspace,
    private readonly name: string,
    initial: Model,
    private readonly gaps: Gaps,
  ) {
    this.model = structuredClone(initial);
    this.project = Project.clone(workspace, name);
    this.project.sync(this.model);
  }

  /** Run one step and return the violations it found (an edit finds none; checks do). */
  step(step: Step): Violation[] {
    if (!applies(this.model, step))
      throw new Error(`step does not apply here: ${JSON.stringify(step)}`);
    this.steps.push(step);
    if (step.op === "check") return this.record(this.check(step.only));
    if (step.op === "coldCheck") return this.record(this.coldCheck());
    apply(this.model, step);
    this.touched.push(...this.project.sync(this.model));
    return [];
  }

  private record(found: Violation[]): Violation[] {
    this.violations.push(...found);
    return found;
  }

  private check(only: string): Violation[] {
    const services = Object.keys(this.model);
    const tilt = tiltGraph(this.project.dir, services);
    const reload = this.watched
      ? { touched: this.touched, watched: this.watched, daemon: daemonSnapshot(this.project.dir) }
      : undefined;
    if (tilt.ok) this.watched = tilt.watched;
    this.touched = [];
    return check(
      this.model,
      {
        tilt,
        verify: verify(this.project.dir),
        only: {
          name: only,
          up: upOnly(this.project.dir, only),
          focus: tiltGraph(this.project.dir, services, [only]),
        },
        reload,
        env: this.env(this.project),
      },
      this.gaps,
    );
  }

  private env(project: Project): FrontendEnv {
    const out: FrontendEnv = {};
    for (const [name, spec] of Object.entries(this.model)) {
      const dir = spec.kind === "frontend" ? project.serviceDir(name) : null;
      const file = dir ? readFrontendEnv(dir) : null;
      if (file) out[name] = file;
    }
    return out;
  }

  private coldCheck(): Violation[] {
    const services = Object.keys(this.model);
    const cold = this.project.coldCopy(`${this.name}-cold${++this.colds}`);
    const warmGraph = tiltGraph(this.project.dir, services);
    const coldGraph = tiltGraph(cold.dir, services);
    return checkWarmCold(warmGraph, coldGraph, this.env(this.project), this.env(cold));
  }

  /** The steps so far as a scenario file body, ready to paste into ./scenarios. */
  scenario(): string {
    const ids = [...new Set(this.violations.map((violation) => violation.id))].sort();
    return JSON.stringify({ title: "", why: "", steps: this.steps, expect: ids }, null, 2);
  }
}

export function describeViolations(violations: Violation[]): string {
  return violations.map((violation) => `  ${violation.id}: ${violation.detail}`).join("\n");
}
