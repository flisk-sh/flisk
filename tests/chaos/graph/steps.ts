// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import fc from "fast-check";
import { KIND_OF, type Model, type Shape, STACKS } from "./model.js";

// What a developer does to service.json files between two looks at the graph. Random runs and the recorded scenarios
// (./scenarios/*.json) use the same steps, so a failing random sequence can be pasted into a scenario as is.

export type Step =
  | { op: "addDep"; owner: string; entry: string }
  | { op: "removeDep"; owner: string; entry: string }
  | { op: "setDeps"; owner: string; entries: string[] }
  | { op: "addService"; name: string; stack: string }
  | { op: "removeService"; name: string }
  | { op: "moveStack"; name: string; stack: string }
  /** Frontends: point backendName at another service (or at a name that is not one). */
  | { op: "setBackend"; owner: string; entry: string }
  /** Write the deprecated `dependencies` key. An empty list removes it. */
  | { op: "setLegacy"; owner: string; entries: string[] }
  /** Write dependsOn as a string, null or object instead of a list (`array` puts the list back). */
  | { op: "setShape"; owner: string; shape: Shape }
  /** Look at the graph: Tilt, `flisk config verify`, and `flisk up --only <only>` with Tilt's --focus for it. */
  | { op: "check"; only: string }
  /** Compare the graph with the one a fresh copy of the same service.json files gives. */
  | { op: "coldCheck" };

// Not `alpha` or `beta`: focus treats those as release phases (see scenarios/service-named-like-a-phase.json).
export const INITIAL: Model = {
  orders: { kind: "backend", stack: "main", dependsOn: [] },
  billing: { kind: "backend", stack: "main", dependsOn: [] },
  users: { kind: "backend", stack: "extra", dependsOn: [] },
  storefront: { kind: "frontend", stack: "main", dependsOn: ["orders"], backendName: "orders" },
  mailer: { kind: "worker", stack: "main", dependsOn: [] },
};

/** Three plain backends: the start of the scenarios that predate frontends and workers. */
export const SMALL: Model = {
  orders: { kind: "backend", stack: "main", dependsOn: [] },
  billing: { kind: "backend", stack: "main", dependsOn: [] },
  users: { kind: "backend", stack: "extra", dependsOn: [] },
};

const SERVICES = Object.keys(KIND_OF);
/** A typo, a name that was never a service, and a near miss of a real one. */
const JUNK = ["ghost", "ordres", "billing-api"];
const ENTRIES = [...SERVICES, ...STACKS, ...JUNK, "postgres"];
const SHAPES: Shape[] = ["string", "null", "object", "array"];

/** False when the step makes no sense for this model (fast-check then skips it). */
export function applies(model: Model, step: Step): boolean {
  switch (step.op) {
    case "addDep":
      return step.owner in model && !model[step.owner].dependsOn.includes(step.entry);
    case "removeDep":
      return step.owner in model && model[step.owner].dependsOn.includes(step.entry);
    case "setDeps":
    case "setLegacy":
    case "setShape":
      return step.owner in model;
    case "setBackend":
      return step.owner in model && model[step.owner].kind === "frontend";
    case "addService":
      return !(step.name in model);
    case "removeService":
      return step.name in model && Object.keys(model).length > 1;
    case "moveStack":
      return step.name in model && model[step.name].stack !== step.stack;
    case "check":
      return step.only in model;
    case "coldCheck":
      return true;
  }
}

/** Apply an edit to the model. Checks change nothing. */
export function apply(model: Model, step: Step): void {
  switch (step.op) {
    case "addDep":
      model[step.owner].dependsOn = [...model[step.owner].dependsOn, step.entry];
      return;
    case "removeDep":
      model[step.owner].dependsOn = model[step.owner].dependsOn.filter(
        (entry) => entry !== step.entry,
      );
      return;
    case "setDeps":
      model[step.owner].dependsOn = [...step.entries];
      return;
    case "setLegacy":
      model[step.owner].legacy = step.entries.length > 0 ? [...step.entries] : undefined;
      return;
    case "setShape":
      model[step.owner].shape = step.shape === "array" ? undefined : step.shape;
      return;
    case "setBackend":
      model[step.owner].backendName = step.entry;
      return;
    case "addService": {
      const kind = KIND_OF[step.name] ?? "backend";
      model[step.name] =
        kind === "frontend"
          ? { kind, stack: step.stack, dependsOn: [], backendName: "orders" }
          : { kind, stack: step.stack, dependsOn: [] };
      return;
    }
    case "removeService":
      delete model[step.name];
      return;
    case "moveStack":
      model[step.name].stack = step.stack;
      return;
    default:
      return;
  }
}

const service = fc.constantFrom(...SERVICES);
const entry = fc.constantFrom(...ENTRIES);
const stack = fc.constantFrom(...STACKS);

export const stepArbitrary: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({ op: fc.constant("addDep" as const), owner: service, entry }),
  },
  {
    weight: 2,
    arbitrary: fc.record({ op: fc.constant("removeDep" as const), owner: service, entry }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      op: fc.constant("setDeps" as const),
      owner: service,
      entries: fc.uniqueArray(entry, { maxLength: 3 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({ op: fc.constant("addService" as const), name: service, stack }),
  },
  { weight: 1, arbitrary: fc.record({ op: fc.constant("removeService" as const), name: service }) },
  {
    weight: 1,
    arbitrary: fc.record({ op: fc.constant("moveStack" as const), name: service, stack }),
  },
  {
    weight: 2,
    arbitrary: fc.record({ op: fc.constant("setBackend" as const), owner: service, entry }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      op: fc.constant("setLegacy" as const),
      owner: service,
      entries: fc.uniqueArray(entry, { maxLength: 2 }),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      op: fc.constant("setShape" as const),
      owner: service,
      shape: fc.constantFrom(...SHAPES),
    }),
  },
  { weight: 4, arbitrary: fc.record({ op: fc.constant("check" as const), only: service }) },
  { weight: 1, arbitrary: fc.constant({ op: "coldCheck" as const }) },
);
