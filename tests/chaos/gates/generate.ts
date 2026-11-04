// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

// A seeded generator of service.json sets: valid ones, and valid ones with known corruptions. Every corruption names the
// class of mistake it makes, so the gate verdict has a known right answer. Pure and fast on purpose: the bulk runner makes
// millions of these per minute, which only works because nothing here touches the disk.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Manifest = Record<string, Json>;

/** xorshift128+ seeded from a 32-bit number: fast, deterministic, good enough to spread cases. */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  constructor(seed: number) {
    this.a = seed | 0 || 0x9e3779b9;
    this.b = (seed * 0x85ebca6b) | 0 || 0xc2b2ae35;
    this.c = (seed ^ 0x27d4eb2f) | 0 || 0x165667b1;
    this.d = (seed + 0x7f4a7c15) | 0 || 0xd3a2646c;
    for (let i = 0; i < 16; i++) this.next();
  }
  next(): number {
    const t = this.d;
    let s = this.a;
    this.d = this.c;
    this.c = this.b;
    this.b = s;
    const u = (t ^ (t << 11)) | 0;
    s = (u ^ (u >>> 8) ^ s ^ (s >>> 19)) | 0;
    this.a = s;
    return (s >>> 0) / 4294967296;
  }
  int(max: number): number {
    return Math.floor(this.next() * max);
  }
  pick<T>(list: readonly T[]): T {
    return list[this.int(list.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

export type Corruption =
  | "port-type"
  | "port-range"
  | "dependsOn-shape"
  | "dependsOn-cycle"
  | "dependsOn-self"
  | "appName-type"
  | "appName-duplicate"
  | "appName-docker-unsafe"
  | "stack-docker-unsafe"
  | "schemaVersion"
  | "control-char"
  | "healthCheckPath"
  | "stack-pattern"
  | "not-an-object";

/** Corruptions every gate is expected to refuse. The `-docker-unsafe` ones are expected to be refused too; the Docker tier proves why. */
export const CORRUPTIONS: readonly Corruption[] = [
  "port-type",
  "port-range",
  "dependsOn-shape",
  "dependsOn-cycle",
  "dependsOn-self",
  "appName-type",
  "appName-duplicate",
  "appName-docker-unsafe",
  "stack-docker-unsafe",
  "schemaVersion",
  "control-char",
  "healthCheckPath",
  "stack-pattern",
  "not-an-object",
];

const NAMES = [
  "orders",
  "billing",
  "users",
  "search",
  "mailer",
  "storefront",
  "console",
  "audit",
  "cart",
  "ledger",
];
const STACKS = ["main", "extra", "shop", "back-office", "core"];
const TYPES = ["backend", "backend", "backend", "frontend", "worker"] as const;
const HEALTH = ["/health", "/healthz", "/api/v1/health", "/"];
const FEATURES = ["vitest", "nats", "redis", "traefik", "websocket", "graphql"];

export interface Case {
  /** One entry per service.json; a non-object entry is a file that held something else. */
  files: Json[];
  corruptions: Corruption[];
}

function baseManifest(rng: Rng, name: string, others: string[]): Manifest {
  const type = rng.pick(TYPES);
  const manifest: Manifest = {
    appName: name,
    name,
    appType: type,
    type,
    stack: rng.pick(STACKS),
    schemaVersion: 1,
    port: type === "frontend" ? 3000 + rng.int(500) : 4000 + rng.int(900),
    dependsOn: others.filter(() => rng.chance(0.15)).slice(0, 3),
  };
  if (type === "backend" && rng.chance(0.7)) manifest.healthCheckPath = rng.pick(HEALTH);
  if (rng.chance(0.4)) manifest.featuresEnabled = FEATURES.filter(() => rng.chance(0.3));
  // A frontend runs as one container (Compose is not generated for "<name>-1"), so only the other kinds scale.
  if (type !== "frontend" && rng.chance(0.2)) manifest.replicas = 1 + rng.int(3);
  return manifest;
}

/** A valid set: unique names, an acyclic dependsOn (a service only depends on earlier ones). */
export function validSet(rng: Rng): Manifest[] {
  const count = 1 + rng.int(6);
  const names = [...NAMES].sort(() => rng.next() - 0.5).slice(0, count);
  return names.map((name, index) => baseManifest(rng, name, names.slice(0, index)));
}

const WEIRD_STRINGS = [
  "a\nb",
  "x\r",
  "tab\there",
  "nul\u0000",
  "ls ",
  "next\u0085line",
  "esc\u001b[0m",
];
const BAD_PORTS: Json[] = [0, -1, 65536, 99999, 1.5, "4000", null, true, [], {}, "", 1e21];
const BAD_SHAPES: Json[] = [
  "orders",
  "orders,billing",
  null,
  7,
  true,
  {},
  { orders: true },
  [1, 2],
  [null],
  [["orders"]],
];
const UNSAFE_NAMES = [
  "Orders",
  "my service",
  "ORDERS_API",
  "orders/",
  "-orders",
  "orders:",
  "ünï",
  "a".repeat(200),
  "orders.",
  "o rders",
];

function textField(manifest: Manifest, rng: Rng): string {
  const fields = [
    "appName",
    "name",
    "stack",
    "healthCheckPath",
    "dockerfile",
    "buildContext",
    "basePath",
  ];
  const key = rng.pick(
    fields.filter((field) => field in manifest || field === "dockerfile" || field === "basePath"),
  );
  return key;
}

/** Apply one corruption to a set of valid manifests and return the class actually applied (or null when it did not fit). */
function corrupt(files: Json[], kind: Corruption, rng: Rng): Corruption | null {
  const objects = files.filter(
    (file): file is Manifest => !!file && typeof file === "object" && !Array.isArray(file),
  );
  if (objects.length === 0) return null;
  const target = rng.pick(objects);
  switch (kind) {
    case "port-type":
      target.port = rng.pick(
        BAD_PORTS.filter((port) => typeof port !== "number" || !Number.isInteger(port)),
      );
      return kind;
    case "port-range":
      target.port = rng.pick([0, -1, 65536, 70000, 1e6]);
      return kind;
    case "dependsOn-shape":
      target.dependsOn = rng.pick(BAD_SHAPES);
      return kind;
    case "dependsOn-self":
      target.dependsOn = [target.appName as string];
      return kind;
    case "dependsOn-cycle": {
      if (objects.length < 2) return null;
      const other = rng.pick(objects.filter((file) => file !== target));
      target.dependsOn = [other.appName as string];
      other.dependsOn = [target.appName as string];
      return kind;
    }
    case "appName-type":
      target.appName = rng.pick([7, null, true, ["orders"], { n: 1 }]);
      return kind;
    case "appName-duplicate": {
      if (objects.length < 2) return null;
      const other = rng.pick(objects.filter((file) => file !== target));
      other.appName = target.appName;
      other.name = target.name;
      return kind;
    }
    case "appName-docker-unsafe":
      target.appName = rng.pick(UNSAFE_NAMES);
      target.name = target.appName;
      return kind;
    case "stack-docker-unsafe":
      target.stack = rng.pick(["Shop", "MAIN", "Back_Office", "a".repeat(120)]);
      return kind;
    case "schemaVersion":
      target.schemaVersion = rng.pick([0, 2, -1, "1", null, 1.5]);
      return kind;
    case "control-char":
      target[textField(target, rng)] = rng.pick(WEIRD_STRINGS);
      return kind;
    case "healthCheckPath":
      target.healthCheckPath = rng.pick([
        "health",
        "/he alth",
        "/h'ealth",
        '/health"',
        "/a;b",
        "/{x}",
        "$(x)",
        "/A/B",
      ]);
      return kind;
    case "stack-pattern":
      target.stack = rng.pick(["a b", "a.b", "a/b", "a:b", "$x", "a'b", 'a"b', "é"]);
      return kind;
    case "not-an-object": {
      const index = files.indexOf(target);
      files[index] = rng.pick([null, 7, "text", [], [1], true]);
      return kind;
    }
  }
}

/** A case: a valid set, and with probability `badRate` one to three corruptions on it. */
export function makeCase(rng: Rng, badRate = 0.6): Case {
  const files: Json[] = validSet(rng);
  const corruptions: Corruption[] = [];
  if (rng.chance(badRate)) {
    const wanted = 1 + rng.int(3);
    for (let i = 0; i < wanted; i++) {
      const applied = corrupt(files, rng.pick(CORRUPTIONS), rng);
      if (applied) corruptions.push(applied);
    }
  }
  return { files, corruptions };
}
