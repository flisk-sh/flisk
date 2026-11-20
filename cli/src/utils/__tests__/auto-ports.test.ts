// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTempDir, makeResource } from "../../test-support/index.js";
import type { DiscoveredResource } from "../../types/index.js";
import {
  applySavedAutoPorts,
  autoPortEnvName,
  autoPortStatePath,
  readAutoPortState,
  resolveAutoPorts,
} from "../auto-ports.js";
import { checkDuplicateResourcePorts } from "../doctor-wiring.js";
import { planNativeRun } from "../native-runtime.js";
import { checkServicePorts } from "../service-config-checks.js";
import { validateServiceManifest } from "../service-manifest.js";

/** A shared claim board models two processes starting at once in two checkouts. */
function claimBoard(): (owner: string) => (port: number) => boolean {
  const claims = new Map<number, string>();
  return (owner) => (port) => {
    const holder = claims.get(port);
    if (holder !== undefined && holder !== owner) return false;
    claims.set(port, owner);
    return true;
  };
}

const free = async () => true;

function autoApi(): DiscoveredResource {
  return makeResource("api", "backend", { port: "auto" });
}

function hash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("auto ports", () => {
  it("gives two checkouts side by side different ports and keeps each choice in that checkout", async () => {
    const firstCheckout = createTempDir("flisk-checkout-a-");
    const secondCheckout = createTempDir("flisk-checkout-b-");
    const claim = claimBoard();

    const first = await resolveAutoPorts([autoApi()], firstCheckout, {
      claim: claim("checkout-a"),
      isFree: free,
    });
    const second = await resolveAutoPorts([autoApi()], secondCheckout, {
      claim: claim("checkout-b"),
      isFree: free,
    });

    expect(first.ports.get("api")).toBe(4000);
    expect(second.ports.get("api")).toBe(4001);
    expect(readAutoPortState(firstCheckout).get("api")?.port).toBe(4000);
    expect(readAutoPortState(secondCheckout).get("api")?.port).toBe(4001);
    expect(autoPortStatePath(firstCheckout)).not.toBe(autoPortStatePath(secondCheckout));
  });

  it("reuses a saved port while it is free, then keeps the replacement on the next up", async () => {
    const root = createTempDir("flisk-auto-reuse-");
    const claim = claimBoard()("checkout-a");

    const first = await resolveAutoPorts([autoApi()], root, { claim, isFree: free });
    expect(first.ports.get("api")).toBe(4000);

    const busy = await resolveAutoPorts([autoApi()], root, {
      claim,
      isFree: async (port) => port !== 4000,
    });
    expect(busy.ports.get("api")).toBe(4001);

    const reused = await resolveAutoPorts([autoApi()], root, { claim, isFree: free });
    expect(reused.ports.get("api")).toBe(4001);
  });

  it("leaves fixed ports and their conflict handling alone unless --auto-port is given", async () => {
    const root = createTempDir("flisk-auto-fixed-");
    const fixed = makeResource("shop-api", "backend", {
      port: 4003,
      command: "node api.js",
    });

    const normal = await resolveAutoPorts([fixed], root, { isFree: free, claim: () => true });
    expect(normal.ports.size).toBe(0);
    expect(normal.env).toEqual({});
    expect(normal.resources[0]?.port).toBe(4003);

    const forced = await resolveAutoPorts([fixed], root, {
      force: true,
      isFree: free,
      claim: () => true,
    });
    expect(forced.ports.get("shop-api")).toBe(4000);
    expect(forced.report.autoPorts[0]).toMatchObject({ source: "flag" });
  });

  it("sets PORT and rewrites dependency URLs to the port chosen for this run", async () => {
    const root = createTempDir("flisk-auto-urls-");
    const api = makeResource("api", "backend", { port: "auto", command: "node api.js" });
    const web = makeResource("web", "frontend", {
      port: "auto",
      command: "node web.js",
      dependsOn: ["api"],
      env: { API_URL: "http://localhost:4000/api" },
    });

    const resolution = await resolveAutoPorts([api, web], root, {
      isFree: async (port) => port !== 4000 && port !== 3000,
      claim: () => true,
    });

    expect(resolution.env).toEqual({
      FLISK_SERVICE_API_PORT: "4001",
      FLISK_SERVICE_WEB_PORT: "3001",
    });
    expect(autoPortEnvName(api)).toBe("FLISK_SERVICE_API_PORT");

    const plan = planNativeRun(resolution.resources, {}, root);
    const byName = new Map(plan.services.map((service) => [service.name, service]));
    expect(byName.get("api")?.env.PORT).toBe("4001");
    expect(byName.get("web")?.env.API_URL).toBe("http://localhost:4001/api");
    expect(resolution.report.portsBeforeAuto).toEqual([
      { name: "api", port: 4000 },
      { name: "web", port: 3000 },
    ]);
  });

  it("writes only an ignored local state file, never service.json or generated output", async () => {
    const root = createTempDir("flisk-auto-state-");
    const manifest = join(root, "service.json");
    const generatedSpec = join(root, ".flisk", ".flisk-out", "spec.master");
    const generatedCompose = join(
      root,
      "services",
      "app",
      "api",
      ".autogenerated",
      "docker-compose.yml",
    );
    mkdirSync(join(generatedCompose, ".."), { recursive: true });
    mkdirSync(join(generatedSpec, ".."), { recursive: true });
    writeFileSync(manifest, JSON.stringify({ appName: "api", appType: "backend", port: "auto" }));
    writeFileSync(generatedSpec, "spec = 1\n");
    writeFileSync(
      generatedCompose,
      "services:\n  api:\n    ports: ['${FLISK_SERVICE_API_PORT:-4000}:3000']\n",
    );

    const before = [manifest, generatedSpec, generatedCompose].map(hash);
    await resolveAutoPorts([autoApi()], root, { isFree: free, claim: () => true });
    const after = [manifest, generatedSpec, generatedCompose].map(hash);

    expect(after).toEqual(before);
    expect(readFileSync(manifest, "utf-8")).toContain('"port":"auto"');
    expect(readFileSync(join(root, ".flisk", "local", ".gitignore"), "utf-8")).toBe("*\n");
    expect(readAutoPortState(root).get("api")?.port).toBe(4000);
  });

  it("applies the saved port to copies used by status, open and resources", () => {
    const root = createTempDir("flisk-auto-report-");
    const resource = autoApi();
    const overlayRoot = createTempDir("flisk-auto-report-overlay-");
    mkdirSync(join(overlayRoot, ".flisk", "local"), { recursive: true });
    writeFileSync(
      autoPortStatePath(overlayRoot),
      JSON.stringify({ version: 1, ports: { api: { port: 4123, appType: "backend" } } }),
    );

    const [overlaid] = applySavedAutoPorts([resource], overlayRoot);
    expect(overlaid?.port).toBe(4123);
    expect(overlaid?.config?.port).toBe(4123);
    expect(overlaid?.declaredPort).toBe("auto");
    expect(resource.port).toBeUndefined();
    expect(resource.config?.port).toBe("auto");
  });

  it("keeps Starlark placeholders deterministic and their env names in sync with the CLI", () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");
    const portValues = readFileSync(
      join(repoRoot, "runtime/engine/topologies/tilt/manifest/port_values.star"),
      "utf-8",
    );
    const compose = readFileSync(
      join(repoRoot, "runtime/engine/topologies/platform/docker/compose/compose.star"),
      "utf-8",
    );

    expect(portValues).toContain("'${' + _env_name(name) + ':-' + str(default) + '}'");
    expect(portValues).toContain("return 'FLISK_SERVICE_' + result + '_PORT'");
    expect(compose).toContain('load("../../../tilt/manifest/port_values.star", "manifest_port")');
    expect(compose).toContain("manifest_port(manifest, BASE_PORT_FRONTEND, res_name)");
    expect(compose).toContain("manifest_port(manifest, BASE_PORT_BACKEND, res_name)");
    expect(autoPortEnvName(makeResource("api-gateway.v2", "backend"))).toBe(
      "FLISK_SERVICE_API_GATEWAY_V2_PORT",
    );
  });

  it("treats auto as valid in config verify and duplicate-port doctor checks", () => {
    const auto = autoApi();
    const other = makeResource("orders", "backend", { port: "auto" });
    expect(
      validateServiceManifest(
        { appName: "api", appType: "backend", stack: "shop", schemaVersion: 1, port: "auto" },
        "service.json",
      ).errors,
    ).toEqual([]);
    expect(checkServicePorts("/project", [auto]).didPass).toBe(true);
    expect(checkDuplicateResourcePorts("/project", [auto, other]).didPass).toBe(true);
  });
});
