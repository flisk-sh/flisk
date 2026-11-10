// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// Flisk-Bench tasks: a small app (stack "shop": billing on port 4000, orders on 4001, orders dependsOn billing)
// with one thing broken. The prompt is what a developer would type; the check decides pass or fail from the CLI's
// own JSON (`flisk config verify --json`, `flisk up --dry-run --json`), so no container has to start.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { flisk } from "./flisk.js";

export interface Verdict {
  pass: boolean;
  reason: string;
}

export interface Task {
  id: string;
  title: string;
  /** What the developer says. Every player gets exactly this text. */
  prompt: string;
  /** Break the healthy project in place. */
  breakIt(dir: string): void;
  check(dir: string): Verdict;
}

type Manifest = Record<string, unknown>;

export function manifestPath(dir: string, service: string): string {
  return join(dir, "services", "shop", service, "service.json");
}

export function readManifest(dir: string, service: string): Manifest {
  return JSON.parse(readFileSync(manifestPath(dir, service), "utf-8"));
}

export function editManifest(dir: string, service: string, edit: (m: Manifest) => void): void {
  const manifest = readManifest(dir, service);
  edit(manifest);
  writeFileSync(manifestPath(dir, service), `${JSON.stringify(manifest, null, 2)}\n`);
}

function json(dir: string, args: string[]): { data?: Record<string, unknown>; errors?: unknown[] } {
  const result = flisk(dir, [...args, "--json"]);
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { errors: [`not JSON (exit ${result.status}): ${result.stderr.slice(0, 300)}`] };
  }
}

function verifyErrors(dir: string): string[] {
  const out = json(dir, ["config", "verify"]);
  const data = out.data as { valid?: boolean; errors?: string[] } | undefined;
  if (data?.valid) return [];
  return data?.errors?.length ? data.errors : [JSON.stringify(out.errors ?? "verify failed")];
}

/** The services `flisk up shop --only <service>` would start, or an error. */
function closure(dir: string, service: string): { services: string[] } | { error: string } {
  const out = json(dir, ["up", "shop", "--only", service, "--dry-run"]);
  const data = out.data as { ok?: boolean; services?: string[] } | undefined;
  if (data?.ok && data.services) return { services: data.services };
  return { error: JSON.stringify(out.errors ?? out).slice(0, 300) };
}

/** The shared end state of every task: the project verifies, both services exist, orders still starts after billing. */
function healthy(dir: string): Verdict {
  const errors = verifyErrors(dir);
  if (errors.length) return { pass: false, reason: `config verify: ${errors[0].split("\n")[0]}` };
  const orders = closure(dir, "orders");
  if ("error" in orders) return { pass: false, reason: `up --only orders: ${orders.error}` };
  if (!orders.services.includes("billing")) {
    return { pass: false, reason: "orders no longer waits for billing" };
  }
  const billing = closure(dir, "billing");
  if ("error" in billing) return { pass: false, reason: `up --only billing: ${billing.error}` };
  if (billing.services.includes("orders")) return { pass: false, reason: "billing now waits for orders" };
  const stack = json(dir, ["up", "shop", "--dry-run"]);
  if (!(stack.data as { ok?: boolean } | undefined)?.ok) {
    return { pass: false, reason: `up shop: ${JSON.stringify(stack.errors).slice(0, 200)}` };
  }
  return { pass: true, reason: "verify clean, orders starts after billing" };
}

export const TASKS: Task[] = [
  {
    id: "typo-dependson",
    title: "Typo in dependsOn",
    prompt:
      "In this Flisk project, `flisk up shop --only orders` starts orders but not billing, and orders needs billing to work. Fix it.",
    breakIt: (dir) => editManifest(dir, "orders", (m) => (m.dependsOn = ["biling"])),
    check: healthy,
  },
  {
    id: "dependency-cycle",
    title: "Circular dependency",
    prompt:
      "In this Flisk project, `flisk up shop` refuses to start the stack. orders calls billing; billing never calls orders. Fix it.",
    breakIt: (dir) => editManifest(dir, "billing", (m) => (m.dependsOn = ["orders"])),
    check: healthy,
  },
  {
    id: "object-dependson",
    title: "dependsOn written as an object",
    prompt: "In this Flisk project, `flisk up shop` fails with an error about orders. Fix it.",
    breakIt: (dir) => editManifest(dir, "orders", (m) => (m.dependsOn = { billing: true })),
    check: healthy,
  },
  {
    id: "uppercase-app-name",
    title: "Uppercase appName",
    prompt:
      "In this Flisk project, someone renamed something in orders and now `flisk up shop` fails. Fix it; the service must stay called orders.",
    breakIt: (dir) => editManifest(dir, "orders", (m) => (m.appName = "Orders")),
    check: (dir) => {
      const base = healthy(dir);
      if (!base.pass) return base;
      const name = readManifest(dir, "orders").appName;
      return name === "orders"
        ? base
        : { pass: false, reason: `orders appName is now ${JSON.stringify(name)}` };
    },
  },
  {
    id: "port-clash",
    title: "Two services on one port",
    prompt:
      "In this Flisk project, billing and orders never run at the same time: whichever starts second says the port is already in use. Billing's port is used by other teams and must not change. Fix it.",
    breakIt: (dir) => editManifest(dir, "orders", (m) => (m.port = 4000)),
    check: (dir) => {
      const base = healthy(dir);
      if (!base.pass) return base;
      const billing = readManifest(dir, "billing").port;
      const orders = readManifest(dir, "orders").port;
      if (billing !== 4000) return { pass: false, reason: `billing port changed to ${billing}` };
      if (typeof orders !== "number" || orders === billing) {
        return { pass: false, reason: `orders port is ${JSON.stringify(orders)}` };
      }
      return { pass: true, reason: `orders moved to ${orders}` };
    },
  },
];
