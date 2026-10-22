// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const composeStar = JSON.stringify(
  join(repoRoot, "engine", "topologies", "platform", "docker", "compose", "compose.star"),
);
const traefikStar = JSON.stringify(
  join(repoRoot, "engine", "topologies", "platform", "docker", "networking", "traefik.star"),
);

const hasTilt = spawnSync("tilt", ["version"], { encoding: "utf-8" }).status === 0;
if (process.env.TDK_REQUIRE_TILT === "1" && !hasTilt) {
  throw new Error("Tilt is required for Starlark generator tests in CI.");
}

const temporaryDirs: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** Evaluates a Tiltfile. A failed `fail(...)` makes tilt exit non-zero and puts the message in stderr. */
function runTiltfile(source: string): SpawnSyncReturns<string> {
  const directory = mkdtempSync(join(tmpdir(), "tdk-unsafe-values-"));
  temporaryDirs.push(directory);
  const tiltfile = join(directory, "Tiltfile");
  writeFileSync(tiltfile, source);
  return spawnSync("tilt", ["alpha", "tiltfile-result", "-f", tiltfile], {
    cwd: repoRoot,
    encoding: "utf-8",
    timeout: 25000,
  });
}

/** Generates the Compose entry for `orders-api` in stack `shop`, with `extra` merged into its manifest. */
const entryFor = (extra: string): string => `
load(${composeStar}, 'generate_backend_compose_entry')
manifest = {'appType': 'backend', 'stack': 'shop', 'port': 4000, 'appName': 'orders-api', '_resource_path': 'services/shop/orders-api'}
manifest.update(${extra})
entry = generate_backend_compose_entry('services/shop', 'orders-api', {'name': 'orders-api', '_resource_path': 'services/shop/orders-api'}, manifest)
`;

// Starlark source text: a real line break followed by a YAML key.
const BAD = "\\n    privileged: true";

describe.skipIf(!hasTilt)(
  "compose generators refuse unsafe manifest values (#710)",
  { timeout: 40_000 },
  () => {
    it("still generates an entry for a clean manifest", () => {
      const result = runTiltfile(entryFor("{}"));
      expect(result.status, result.stderr).toBe(0);
    });

    it.each([
      ["healthCheckPath", `{'healthCheckPath': '/h${BAD}'}`],
      ["port", `{'port': '4000${BAD}'}`],
      ["traefik.host", `{'traefik': {'host': 'a.local${BAD}'}}`],
      ["traefik.pathPrefix", `{'traefik': {'pathPrefix': '/api${BAD}'}}`],
      ["traefik.healthCheck", `{'traefik': {'pathPrefix': '/api', 'healthCheck': '/h${BAD}'}}`],
      ["nats.queueGroup", `{'nats': {'queueGroup': 'g${BAD}'}}`],
      ["databaseName", `{'databaseName': 'TDK_x${BAD}'}`],
      ["stack", `{'stack': 'shop${BAD}'}`],
      ["image", `{'appType': 'bring-your-own', 'image': 'app${BAD}'}`],
      ["dockerfile", `{'appType': 'bring-your-own', 'dockerfile': 'Dockerfile${BAD}'}`],
      ["buildContext", `{'appType': 'bring-your-own', 'buildContext': 'src${BAD}'}`],
      ["agent.durability", `{'agent': {'durability': 'files${BAD}'}}`],
    ])("backend entry: refuses a line break in %s", (field, extra) => {
      const result = runTiltfile(entryFor(extra));
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`MANIFEST ERROR: '${field}'`);
      expect(result.stderr).not.toContain("privileged: true");
    });

    it("backend entry: refuses a control character, not only a line break", () => {
      const result = runTiltfile(entryFor("{'healthCheckPath': '/h\\x07'}"));
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("MANIFEST ERROR: 'healthCheckPath'");
    });

    it.each([
      ["traefik.host", `{'traefik': {'host': 'a.local${BAD}'}}`],
      ["basePath", `{'basePath': '/web${BAD}'}`],
    ])("frontend entry: refuses a line break in %s", (field, extra) => {
      const result = runTiltfile(`
load(${composeStar}, 'generate_frontend_compose')
manifest = {'appType': 'frontend', 'stack': 'shop', 'port': 3000, 'appName': 'shop-frontend'}
manifest.update(${extra})
generate_frontend_compose('services/shop', 'shop-frontend', {'name': 'shop-frontend', '_resource_path': 'services/shop/shop-frontend'}, manifest)
`);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`MANIFEST ERROR: '${field}'`);
    });

    it("traefik labels: refuse a line break even when called directly", () => {
      const result = runTiltfile(`
load(${traefikStar}, 'get_backend_traefik_labels')
get_backend_traefik_labels('orders-api', 'a.local', '/api${BAD}', 'orders-api', 4000, '/health', {'stack': 'shop'})
`);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("MANIFEST ERROR: 'traefik_path'");
    });

    it("traefik labels: refuse a line break in manifest.traefik.host even when the params are clean", () => {
      const result = runTiltfile(`
load(${traefikStar}, 'get_backend_traefik_labels')
get_backend_traefik_labels('orders-api', 'a.local', '/api', 'orders-api', 4000, '/health', {'stack': 'shop', 'traefik': {'host': 'x${BAD}'}})
`);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("MANIFEST ERROR: 'traefik.host'");
    });

    it.each([
      [
        "resource_entry_name",
        `'orders-api${BAD}', 'a.local', '/api', 'orders-api', 4000, '/health'`,
      ],
      ["traefik_host", `'orders-api', 'a.local${BAD}', '/api', 'orders-api', 4000, '/health'`],
      [
        "traefik_resource_name",
        `'orders-api', 'a.local', '/api', 'orders-api${BAD}', 4000, '/health'`,
      ],
      ["internal_port", `'orders-api', 'a.local', '/api', 'orders-api', '4000${BAD}', '/health'`],
      ["health_path", `'orders-api', 'a.local', '/api', 'orders-api', 4000, '/health${BAD}'`],
    ])("backend traefik labels: refuse a line break in %s when called directly", (field, args) => {
      const result = runTiltfile(`
load(${traefikStar}, 'get_backend_traefik_labels')
get_backend_traefik_labels(${args}, {'stack': 'shop'})
`);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`MANIFEST ERROR: '${field}'`);
      expect(result.stderr).not.toContain("privileged: true");
    });

    it.each([
      ["res_name", `'shop-frontend${BAD}', 'shop', '/web', 3000, 'a.local'`],
      ["domain", `'shop-frontend', 'shop${BAD}', '/web', 3000, 'a.local'`],
      ["base_path", `'shop-frontend', 'shop', '/web${BAD}', 3000, 'a.local'`],
      ["port", `'shop-frontend', 'shop', '/web', '3000${BAD}', 'a.local'`],
      ["traefik_host", `'shop-frontend', 'shop', '/web', 3000, 'a.local${BAD}'`],
    ])("frontend traefik labels: refuse a line break in %s when called directly", (field, args) => {
      const result = runTiltfile(`
load(${traefikStar}, 'get_frontend_traefik_labels')
get_frontend_traefik_labels(${args})
`);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`MANIFEST ERROR: '${field}'`);
      expect(result.stderr).not.toContain("privileged: true");
    });
  },
);
