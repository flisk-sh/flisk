// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const discoveryRoot = join(repoRoot, "runtime", "discovery");

/** Every service manifest Flisk owns under runtime/discovery. Adding a new one requires an explicit decision here. */
const ALLOWED_DISCOVERY_MANIFESTS = [
  "services/platform/cdc/debezium/nats-connector/service.yaml",
  "services/platform/cdc/nats-http-bridge/service.yaml",
  "services/platform/orchestrator/orchestrator-glue-backend/service.yaml",
  "services/platform/synthetic-monitor/service.yaml",
];

const MANIFEST_FILE_NAMES = new Set(["service.yaml", "service.yml", "service.json"]);

function shippedManifests(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...shippedManifests(fullPath));
    } else if (entry.isFile() && MANIFEST_FILE_NAMES.has(entry.name)) {
      found.push(relative(discoveryRoot, fullPath).split(sep).join("/"));
    }
  }
  return found.sort();
}

describe("discovery runtime repository hygiene", () => {
  it("ships only the allow-listed Flisk service manifests", () => {
    expect(shippedManifests(discoveryRoot)).toEqual([...ALLOWED_DISCOVERY_MANIFESTS].sort());
  });

  it("ships no manifests from the unrelated identity product", () => {
    const identityManifests = shippedManifests(discoveryRoot).filter((path) =>
      path.split("/").some((segment) => segment.includes("identity")),
    );
    expect(identityManifests).toEqual([]);
  });
});
