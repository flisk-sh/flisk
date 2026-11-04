// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  areMasterFilesStale,
  generateMasterConfigs,
  verifyMasterConfigs,
} from "../../generator/template-engine.js";
import { makeResource } from "../../test-support/index.js";
import {
  describePlatformServices,
  isDatabaseCapabilityEnabled,
  isGatewayEnabled,
  projectNeedsDatabaseKeys,
} from "../capabilities.js";
import { evaluatePlatformServiceNeeds, needsDatabaseKeys } from "../platform-services.js";

const roots: string[] = [];

function project(
  services: Record<string, Record<string, unknown>>,
  capabilities?: Record<string, boolean>,
): string {
  const root = mkdtempSync(join(tmpdir(), "flisk-unused-platform-"));
  roots.push(root);
  mkdirSync(join(root, ".flisk"), { recursive: true });
  const phase = (name: string, enabledStacks: string[]) => ({
    name,
    description: name,
    enabledStacks,
  });
  writeFileSync(
    join(root, ".flisk", "project.json"),
    JSON.stringify({
      version: "1.0.0",
      project: { name: "adopter", version: "1.0.0" },
      phases: {
        pre_alpha: phase("Pre-Alpha", ["database-management", "proxy"]),
        alpha: phase("Alpha", []),
        beta: phase("Beta", []),
        out_of_scope: phase("Out of Scope", []),
      },
      optional_infra: {
        monitoring: false,
        elk: false,
        debezium: false,
        golden_image: false,
        verdaccio: false,
      },
      discovery: { paths: ["services/*"] },
      ...(capabilities ? { capabilities } : {}),
    }),
  );
  for (const [name, manifest] of Object.entries(services)) {
    mkdirSync(join(root, "services", name), { recursive: true });
    writeFileSync(
      join(root, "services", name, "service.json"),
      JSON.stringify({ appName: name, stack: "app", schemaVersion: 1, port: 4100, ...manifest }),
    );
  }
  return root;
}

const byo = (extra: Record<string, unknown> = {}) => ({
  appType: "bring-your-own",
  image: "caddy:2",
  exposeViaProxy: false,
  ...extra,
});

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("platform services follow the resources (#2963)", () => {
  it("a project of only unrouted bring-your-own services starts neither the router nor Postgres", async () => {
    const root = project({ caddy: byo(), app: byo({ port: 4101 }) });
    expect(isGatewayEnabled(root)).toBe(false);
    expect(isDatabaseCapabilityEnabled(root)).toBe(false);

    await generateMasterConfigs(root, { quiet: true });
    const spec = readFileSync(join(root, ".flisk", ".flisk-out", "spec.master"), "utf-8");
    expect(spec).not.toContain('"proxy"');
    expect(spec).not.toContain("database-management");
    expect(verifyMasterConfigs(root).errors).toEqual([]);
    // Focus mode adds traefik and postgres from CORE_INFRA, so the Tiltfile itself must refuse them.
    const tiltfile = readFileSync(join(root, ".flisk", ".flisk-out", "Tiltfile"), "utf-8");
    expect(tiltfile).toContain(
      'DISABLED_PLATFORM_INFRA = ["proxy", "traefik", "database-management"]',
    );
  });

  it("a project that uses both leaves the Tiltfile's disabled list empty", async () => {
    const root = project({ api: { appType: "backend" } });
    await generateMasterConfigs(root, { quiet: true });
    const tiltfile = readFileSync(join(root, ".flisk", ".flisk-out", "Tiltfile"), "utf-8");
    expect(tiltfile).toContain("DISABLED_PLATFORM_INFRA = []");
  });

  it("a routed bring-your-own service keeps the router, and still skips Postgres", async () => {
    const root = project({ web: byo({ exposeViaProxy: true }) });
    expect(isGatewayEnabled(root)).toBe(true);
    expect(isDatabaseCapabilityEnabled(root)).toBe(false);
  });

  it("dependsOn postgres, or a database resource, keeps Postgres but not the router", () => {
    const viaDependsOn = project({ app: byo({ dependsOn: ["postgres"] }) });
    expect(isDatabaseCapabilityEnabled(viaDependsOn)).toBe(true);
    expect(isGatewayEnabled(viaDependsOn)).toBe(false);

    const viaDatabase = project({ db: { appType: "database" }, app: byo({ dependsOn: ["db"] }) });
    expect(isDatabaseCapabilityEnabled(viaDatabase)).toBe(true);
  });

  it("a project with any non-bring-your-own resource keeps both, as before", () => {
    const root = project({ api: { appType: "backend" }, caddy: byo() });
    expect(isGatewayEnabled(root)).toBe(true);
    expect(isDatabaseCapabilityEnabled(root)).toBe(true);
  });

  it("an empty project and a project that wraps its own Tiltfile keep the defaults", () => {
    expect(isGatewayEnabled(project({}))).toBe(true);
    const root = project({ app: byo() });
    const file = join(root, ".flisk", "project.json");
    const config = JSON.parse(readFileSync(file, "utf-8"));
    writeFileSync(file, JSON.stringify({ ...config, orchestration: { tiltfile: "Tiltfile" } }));
    expect(isGatewayEnabled(root)).toBe(true);
  });

  it("an explicit capability in project.json wins in both directions", () => {
    const on = project({ app: byo() }, { gateway: true, database: true });
    expect(isGatewayEnabled(on)).toBe(true);
    expect(isDatabaseCapabilityEnabled(on)).toBe(true);
    const off = project({ api: { appType: "backend" } }, { gateway: false });
    expect(isGatewayEnabled(off)).toBe(false);
    expect(isDatabaseCapabilityEnabled(off)).toBe(true);
  });

  it("adding a routed service later makes spec.master stale, and regenerating brings the router back", async () => {
    const root = project({ caddy: byo() });
    await generateMasterConfigs(root, { quiet: true });
    expect(areMasterFilesStale(root)).toBe(false);

    mkdirSync(join(root, "services", "api"), { recursive: true });
    writeFileSync(
      join(root, "services", "api", "service.json"),
      JSON.stringify({
        appName: "api",
        appType: "backend",
        stack: "app",
        schemaVersion: 1,
        port: 4200,
      }),
    );
    expect(areMasterFilesStale(root)).toBe(true);
    await generateMasterConfigs(root, { quiet: true });
    expect(areMasterFilesStale(root)).toBe(false);
    expect(readFileSync(join(root, ".flisk", ".flisk-out", "spec.master"), "utf-8")).toContain(
      "proxy",
    );
  });

  it("status says why each platform service runs", () => {
    const unused = project({ caddy: byo() });
    const resources = [makeResource("caddy", "bring-your-own", { exposeViaProxy: false })];
    const [gateway, database] = describePlatformServices(unused, resources);
    expect(gateway).toMatchObject({ capability: "gateway", isEnabled: false });
    expect(gateway?.reason).toContain("no routed service");
    expect(database).toMatchObject({ capability: "database", isEnabled: false });
    expect(database?.reason).toContain("no dependsOn postgres");

    const used = describePlatformServices(project({ api: { appType: "backend" } }), [
      makeResource("api", "backend"),
    ]);
    expect(used.map((service) => service.isEnabled)).toEqual([true, true]);
    expect(used[0]?.users).toEqual(["api"]);
    expect(used[0]?.reason).not.toContain("api");

    const forced = describePlatformServices(
      project({ caddy: byo() }, { database: true }),
      resources,
    );
    expect(forced[1]).toMatchObject({ isEnabled: true });
    expect(forced[1]?.reason).toContain("capabilities.database in .flisk/project.json is true");
  });

  it("evaluatePlatformServiceNeeds lists the users", () => {
    const needs = evaluatePlatformServiceNeeds([
      makeResource("web", "bring-your-own"),
      makeResource("db", "database"),
    ]);
    expect(needs.gateway).toMatchObject({ isNeeded: true, users: ["web"] });
    expect(needs.database.users).toEqual(["db"]);
  });
});

describe("generated database keys follow the resources (#3200)", () => {
  it("a bring-your-own-only project that does not use Postgres needs no DB_PASSWORD, routed or not", () => {
    expect(projectNeedsDatabaseKeys(project({ caddy: byo(), app: byo({ port: 4101 }) }))).toBe(
      false,
    );
    expect(projectNeedsDatabaseKeys(project({ web: byo({ exposeViaProxy: true }) }))).toBe(false);
  });

  it("keeps them when a resource uses the shared Postgres or is not bring-your-own", () => {
    expect(projectNeedsDatabaseKeys(project({ app: byo({ dependsOn: ["postgres"] }) }))).toBe(true);
    expect(projectNeedsDatabaseKeys(project({ db: { appType: "database" }, app: byo() }))).toBe(
      true,
    );
    expect(projectNeedsDatabaseKeys(project({ api: { appType: "backend" }, caddy: byo() }))).toBe(
      true,
    );
  });

  it("keeps them for an empty project, a wrapped Tiltfile, an explicit database: true and a missing project", () => {
    expect(projectNeedsDatabaseKeys(project({}))).toBe(true);
    expect(projectNeedsDatabaseKeys(project({ app: byo() }, { database: true }))).toBe(true);
    const wrapped = project({ app: byo() });
    const file = join(wrapped, ".flisk", "project.json");
    const config = JSON.parse(readFileSync(file, "utf-8"));
    writeFileSync(file, JSON.stringify({ ...config, orchestration: { tiltfile: "Tiltfile" } }));
    expect(projectNeedsDatabaseKeys(wrapped)).toBe(true);
    const nothing = mkdtempSync(join(tmpdir(), "flisk-no-project-"));
    roots.push(nothing);
    expect(projectNeedsDatabaseKeys(nothing)).toBe(true);
  });

  it("keeps them when a service.json cannot be read, even beside a valid bring-your-own service (review #3227)", () => {
    // The unreadable file might be a backend that uses the database; discovery skips it, so `resources` alone looks BYO-only.
    const root = project({ caddy: byo() });
    mkdirSync(join(root, "services", "broken"), { recursive: true });
    writeFileSync(join(root, "services", "broken", "service.json"), "{ not json");
    expect(projectNeedsDatabaseKeys(root)).toBe(true);
  });

  it("is decided on the resources alone by needsDatabaseKeys", () => {
    expect(needsDatabaseKeys([])).toBe(true);
    expect(needsDatabaseKeys([makeResource("a", "bring-your-own")])).toBe(false);
    expect(
      needsDatabaseKeys([makeResource("a", "bring-your-own"), makeResource("b", "worker")]),
    ).toBe(true);
  });
});
