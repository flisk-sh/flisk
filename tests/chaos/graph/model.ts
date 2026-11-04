// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

// The reference model: what the dependsOn graph should be for a set of service.json files, following the schema
// (runtime/engine/schemas/service-schema.json): "Each entry can be a stack or resource name. Resources listed here start
// before this resource." Every oracle (Tilt, flisk up, flisk config verify) is compared against this, never against another
// oracle, so a bug that two of them share still shows up.

export const STACKS = ["main", "extra"] as const;
export const POSTGRES_NAMES = ["postgres", "database-management"];

export type Kind = "backend" | "frontend" | "worker";
/** How `dependsOn` is written in service.json: a list, or one of the wrong types a hand edit produces. */
export type Shape = "array" | "string" | "null" | "object";

export interface ServiceSpec {
  kind: Kind;
  stack: string;
  dependsOn: string[];
  /** Frontends only: the backend the frontend talks to (Tilt waits for it as well). */
  backendName?: string;
  /** The deprecated `dependencies` key, still written by old projects. */
  legacy?: string[];
  /** Not "array" means dependsOn is written in the wrong type; `dependsOn` above is what the user meant. */
  shape?: Shape;
}

export type Model = Record<string, ServiceSpec>;

/** A name always has the same kind, so a removed and re-added service keeps its role. */
export const KIND_OF: Record<string, Kind> = {
  orders: "backend",
  billing: "backend",
  users: "backend",
  search: "backend",
  storefront: "frontend",
  console: "frontend",
  mailer: "worker",
};

export type EntryKind = "self" | "service" | "stack" | "postgres" | "unknown";

export function classify(model: Model, owner: string, entry: string): EntryKind {
  if (entry === owner) return "self";
  if (entry in model) return "service";
  if (POSTGRES_NAMES.includes(entry)) return "postgres";
  if (Object.values(model).some((service) => service.stack === entry)) return "stack";
  return "unknown";
}

/** Services an entry makes `owner` wait for. A stack entry means every service in that stack except `owner`. */
export function targetsOf(model: Model, owner: string, entry: string): string[] {
  switch (classify(model, owner, entry)) {
    case "service":
      return [entry];
    case "stack":
      // The stack's backend-side services: a UI is never pulled in by a stack name (as with `--focus`).
      return Object.keys(model).filter(
        (name) => name !== owner && model[name].stack === entry && model[name].kind !== "frontend",
      );
    default:
      return [];
  }
}

export const hasBadShape = (spec: ServiceSpec): boolean => (spec.shape ?? "array") !== "array";

/** Every name a service declares: dependsOn, then the deprecated `dependencies` key (both are read). */
export const entriesOf = (spec: ServiceSpec): string[] => [
  ...new Set([...spec.dependsOn, ...(spec.legacy ?? [])]),
];

/**
 * owner -> sorted services it waits for. Self entries are not edges (Tilt drops them on purpose); a service whose dependsOn
 * has the wrong type has none from dependsOn, because there is no valid list to read.
 */
export function edges(model: Model): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [owner, service] of Object.entries(model)) {
    const targets = new Set<string>();
    if (!hasBadShape(service)) {
      for (const entry of entriesOf(service)) {
        for (const target of targetsOf(model, owner, entry)) targets.add(target);
      }
    }
    if (service.kind === "frontend" && service.backendName && service.backendName !== owner) {
      if (service.backendName in model) targets.add(service.backendName);
    }
    out[owner] = [...targets].sort();
  }
  return out;
}

/** One cycle in the graph (first node repeated at the end), or null. */
export function findCycle(graph: Record<string, string[]>): string[] | null {
  const state = new Map<string, "open" | "done">();
  const stack: string[] = [];
  const visit = (node: string): string[] | null => {
    state.set(node, "open");
    stack.push(node);
    for (const next of graph[node] ?? []) {
      if (state.get(next) === "open") return [...stack.slice(stack.indexOf(next)), next];
      if (!state.has(next)) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(node, "done");
    return null;
  };
  for (const node of Object.keys(graph).sort()) {
    if (!state.has(node)) {
      const found = visit(node);
      if (found) return found;
    }
  }
  return null;
}

/** `start` plus everything it transitively waits for. */
export function closure(graph: Record<string, string[]>, start: string): string[] {
  const seen = new Set<string>();
  const walk = (node: string): void => {
    if (seen.has(node)) return;
    seen.add(node);
    for (const next of graph[node] ?? []) walk(next);
  };
  walk(start);
  return [...seen].sort();
}

export function unknownEntries(model: Model): { owner: string; entry: string }[] {
  const out: { owner: string; entry: string }[] = [];
  for (const [owner, service] of Object.entries(model)) {
    if (hasBadShape(service)) continue;
    for (const entry of entriesOf(service)) {
      if (classify(model, owner, entry) === "unknown") out.push({ owner, entry });
    }
  }
  return out;
}

export function selfEntries(model: Model): string[] {
  return Object.entries(model)
    .filter(([owner, service]) => !hasBadShape(service) && entriesOf(service).includes(owner))
    .map(([owner]) => owner);
}

/** Services whose dependsOn has the wrong type. */
export function badShapes(model: Model): string[] {
  return Object.keys(model).filter((name) => hasBadShape(model[name]));
}

/** The env key `VITE_<KEY>_API_URL` a dependency produces. */
export const envKey = (name: string): string => name.toUpperCase().replace(/[-.]/g, "_");

/** What a frontend's generated env should list as dependency URLs: one per entry that is a backend-side service. */
export function expectedEnvDeps(model: Model, owner: string): string[] {
  const spec = model[owner];
  if (spec?.kind !== "frontend" || hasBadShape(spec)) return [];
  const names = entriesOf(spec).filter(
    (entry) => classify(model, owner, entry) === "service" && model[entry].kind === "backend",
  );
  return [...new Set(names.map(envKey))].sort();
}
