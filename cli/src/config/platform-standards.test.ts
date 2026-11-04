// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STANDARD_PORTS } from "../utils/constants.js";
import { PLATFORM_STANDARDS } from "./platform-standards.js";

describe("platform standards", () => {
  it("keeps the low-level Traefik host generic and uses a non-privileged port", () => {
    expect(PLATFORM_STANDARDS.traefik.defaultHost).toBe("localhost");
    expect(PLATFORM_STANDARDS.traefik.appHost).toBe("app.localhost");
    expect(PLATFORM_STANDARDS.traefik.apiHost).toBe("api.localhost");
    expect(PLATFORM_STANDARDS.traefik.defaultPort).toBe(8080);
  });

  it("pins the Traefik network name and feature description", () => {
    expect(PLATFORM_STANDARDS.traefik.network).toBe("traefik-public");
    expect(PLATFORM_STANDARDS.features.traefik).toBe("HTTP routing");
  });

  it("pins the Traefik standard port to match standalone compose", () => {
    expect(STANDARD_PORTS.traefik).toBe(8080);
    expect(PLATFORM_STANDARDS.ports.traefik).toBe(8080);
  });

  // The platform features a service.json may list must be accepted by both Starlark manifest validators, or a
  // service that enables one passes the JSON schema and then fails `flisk up`.
  it("accepts every platform feature in the schema and both Starlark validators", () => {
    const engine = join(dirname(fileURLToPath(import.meta.url)), "../../../runtime/engine");
    const schema = readFileSync(join(engine, "schemas/service-schema.json"), "utf-8");
    const validFeatures = (rel: string) => {
      const line =
        readFileSync(join(engine, rel), "utf-8").match(/^VALID_FEATURES = (.*)$/m)?.[1] ?? "";
      return new Set([...line.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]));
    };
    const validator = validFeatures("topologies/tilt/manifest/validator.star");
    const manifestSchema = validFeatures("topologies/tilt/manifest/schema.star");
    const platformFeatures = [
      "nats",
      "prisma",
      "drizzle",
      "redis",
      "infisical",
      "vitest",
      "traefik",
      "websocket",
      "graphql",
      "grpc",
      "ddd",
      "sablier",
    ];
    for (const feature of platformFeatures) {
      expect(schema, feature).toContain(`"${feature}"`);
      expect(validator.has(feature), `validator.star ${feature}`).toBe(true);
      expect(manifestSchema.has(feature), `schema.star ${feature}`).toBe(true);
    }
  });
});
