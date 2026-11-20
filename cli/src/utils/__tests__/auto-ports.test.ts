// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
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

  it("rewrites dependency URLs only for services the consumer depends on, once, on the whole port", () => {
    // api did not move; orders moved off the same base port. A frontend that depends only on api must keep its URL.
    const api: DiscoveredResource = {
      ...makeResource("api", "backend", { port: 4000, command: "node api.js" }),
      port: 4000,
      declaredPort: "auto",
      portBeforeAuto: 4000,
      autoPort: true,
    };
    const orders: DiscoveredResource = {
      ...makeResource("orders", "backend", { port: 4001, command: "node orders.js" }),
      port: 4001,
      declaredPort: "auto",
      portBeforeAuto: 4000,
      autoPort: true,
    };
    const web: DiscoveredResource = {
      ...makeResource("web", "frontend", {
        port: 3000,
        command: "node web.js",
        dependsOn: ["api"],
        env: { API_URL: "http://localhost:4000/api" },
      }),
      port: 3000,
      declaredPort: "auto",
    };
    const scoped = planNativeRun([api, orders, web], {}, "/tmp/flisk-scope");
    expect(scoped.services.find((service) => service.name === "web")?.env.API_URL).toBe(
      "http://localhost:4000/api",
    );

    // a moved 4000→4001 while b moved 4001→4002: each URL is rewritten against its own original endpoint once,
    // never the output of another rewrite.
    const a: DiscoveredResource = {
      ...makeResource("a", "backend", { port: 4001, command: "node a.js" }),
      port: 4001,
      declaredPort: "auto",
      portBeforeAuto: 4000,
      autoPort: true,
    };
    const b: DiscoveredResource = {
      ...makeResource("b", "backend", { port: 4002, command: "node b.js" }),
      port: 4002,
      declaredPort: "auto",
      portBeforeAuto: 4001,
      autoPort: true,
    };
    const consumer: DiscoveredResource = {
      ...makeResource("consumer", "backend", {
        port: 4010,
        command: "node c.js",
        dependsOn: ["a", "b"],
        env: {
          A_URL: "http://localhost:4000",
          B_URL: "http://localhost:4001",
          UNRELATED: "http://localhost:40000",
        },
      }),
      port: 4010,
      declaredPort: "auto",
    };
    const singlePass = planNativeRun([a, b, consumer], {}, "/tmp/flisk-single-pass");
    const env = singlePass.services.find((service) => service.name === "consumer")?.env;
    expect(env?.A_URL).toBe("http://localhost:4001");
    expect(env?.B_URL).toBe("http://localhost:4002");
    // A longer port that merely starts with the moved number is not a prefix match.
    expect(env?.UNRELATED).toBe("http://localhost:40000");
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

  it("replays a saved --auto-port choice for a service that declares a fixed number", async () => {
    const root = createTempDir("flisk-auto-saved-fixed-");
    mkdirSync(join(root, ".flisk", "local"), { recursive: true });
    writeFileSync(
      autoPortStatePath(root),
      JSON.stringify({ version: 1, ports: { "shop-api": { port: 4005, appType: "backend" } } }),
    );
    const fixed = makeResource("shop-api", "backend", { port: 4003, command: "node api.js" });

    // A later plain `flisk up` runs on the port this checkout chose, not the manifest's number.
    const replayed = await resolveAutoPorts([fixed], root, { isFree: free, claim: () => true });
    expect(replayed.ports.get("shop-api")).toBe(4005);
    expect(replayed.resources[0]?.port).toBe(4005);
    expect(replayed.report.autoPorts[0]).toMatchObject({
      name: "shop-api",
      port: 4005,
      source: "flag",
    });

    // status/open/resources report the same saved port, with the manifest number as the recorded origin.
    const [overlaid] = applySavedAutoPorts([fixed], root);
    expect(overlaid?.port).toBe(4005);
    expect(overlaid?.config?.port).toBe(4005);
    expect(overlaid?.declaredPort).toBe(4003);
    expect(overlaid?.portBeforeAuto).toBe(4003);
  });

  it("keeps the manifest port when the saved assignment left the range", async () => {
    const root = createTempDir("flisk-auto-saved-stale-");
    mkdirSync(join(root, ".flisk", "local"), { recursive: true });
    writeFileSync(
      autoPortStatePath(root),
      JSON.stringify({ version: 1, ports: { "shop-api": { port: 5999, appType: "backend" } } }),
    );
    // 5999 left the backend range (4000-4999): the manifest number is the fallback again.
    const fixed: DiscoveredResource = {
      ...makeResource("shop-api", "backend", { port: 4003, command: "node api.js" }),
      port: 4003,
      declaredPort: 4003,
    };

    const replayed = await resolveAutoPorts([fixed], root, { isFree: free, claim: () => true });
    expect(replayed.ports.size).toBe(0);
    expect(replayed.resources[0]?.port).toBe(4003);
    expect(applySavedAutoPorts([fixed], root)[0]?.port).toBe(4003);
  });

  it("reserves every eligible saved port before allocating a service without one", async () => {
    const root = createTempDir("flisk-auto-two-pass-");
    mkdirSync(join(root, ".flisk", "local"), { recursive: true });
    writeFileSync(
      autoPortStatePath(root),
      JSON.stringify({ version: 1, ports: { "z-api": { port: 4000, appType: "backend" } } }),
    );
    const zApi = makeResource("z-api", "backend", { port: "auto", command: "node z.js" });
    const aApi = makeResource("a-api", "backend", { port: "auto", command: "node a.js" });

    // a-api sorts first and would take 4000; z-api's still-valid saved assignment is reserved ahead of it.
    const resolution = await resolveAutoPorts([aApi, zApi], root, {
      isFree: free,
      claim: () => true,
    });
    expect(resolution.ports.get("a-api")).toBe(4001);
    expect(resolution.ports.get("z-api")).toBe(4000);
  });

  it("keeps an unselected service's fixed port reserved under --auto-port", async () => {
    const root = createTempDir("flisk-auto-force-reserve-");
    const api = makeResource("api", "backend", { port: 4002, command: "node api.js" });
    const admin = makeResource("admin", "backend", { port: 4000, command: "node admin.js" });

    // --auto-port applies to the selection only; admin's 4000 stays reserved, and api never receives it.
    const resolution = await resolveAutoPorts([api], root, {
      force: true,
      all: [api, admin],
      isFree: free,
      claim: () => true,
    });
    expect(resolution.ports.get("api")).toBe(4001);
  });

  it("does not offer a port another process holds on a single listen address", async () => {
    const root = createTempDir("flisk-auto-bind-probe-");
    // A listener on ::1 only: a connect probe to 127.0.0.1 called this port free, and the chosen port was unusable.
    const held = createServer();
    await new Promise<void>((resolve) => held.listen(4000, "::1", () => resolve()));
    try {
      const resolution = await resolveAutoPorts([autoApi()], root, { claim: () => true });
      expect(resolution.ports.get("api")).not.toBe(4000);
    } finally {
      await new Promise<void>((resolve) => held.close(() => resolve()));
    }
  });
});
