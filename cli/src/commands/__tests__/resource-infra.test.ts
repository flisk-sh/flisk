// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertInfraPresetOptions,
  parseResourceType,
  resourceCommand,
} from "../../commands/resource.js";
import { providesErrors, validateServiceManifest } from "../../utils/service-manifest.js";

const jsonOutput = vi.hoisted(() => ({ createJsonEmitter: vi.fn() }));
vi.mock("../../utils/json-output.js", () => ({ ...jsonOutput }));

import { clearDiscoveryCache } from "../../utils/discovery-context.js";

const originalCwd = process.cwd();

describe("infrastructure presets (redis, qdrant, rabbitmq)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-infra-test-"));
    mkdirSync(join(tempDir, ".flisk"), { recursive: true });
    writeFileSync(
      join(tempDir, ".flisk", "project.json"),
      JSON.stringify({
        version: "1.0.0",
        project: { name: "test", version: "1.0.0" },
        phases: Object.fromEntries(
          ["pre_alpha", "alpha", "beta", "out_of_scope"].map((name) => [
            name,
            { name, description: "", enabledStacks: [] },
          ]),
        ),
        optional_infra: {
          monitoring: false,
          elk: false,
          debezium: false,
          golden_image: false,
          verdaccio: false,
        },
        discovery: { paths: ["services/**"] },
      }),
    );
    process.chdir(tempDir);
    clearDiscoveryCache();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  async function create(name: string, type: string, args: string[] = []) {
    const originalLog = console.log;
    console.log = () => {};
    try {
      await resourceCommand.parseAsync(
        ["node", "flisk", name, "--type", type, "--stack", "hqc", "--yes", ...args],
        { from: "node" },
      );
    } finally {
      console.log = originalLog;
    }
    clearDiscoveryCache();
    const dir = join(tempDir, "services", "hqc", name);
    return JSON.parse(readFileSync(join(dir, "service.json"), "utf-8")) as Record<string, unknown>;
  }

  it.each(["redis", "qdrant", "rabbitmq"])("%s is a bring-your-own preset", (type) => {
    expect(parseResourceType(type)).toBe("bring-your-own");
  });

  it("writes a Redis with a probe, its own data volume and the REDIS_URL it provides", async () => {
    const service = await create("cache", "redis");
    expect(service).toMatchObject({
      appName: "cache",
      appType: "bring-your-own",
      stack: "hqc",
      port: 6379,
      image: "redis:7.4-alpine",
      exposeViaProxy: false,
      healthCheck: { command: ["redis-cli", "ping"] },
      volumes: [{ source: "cache-data", target: "/data" }],
      provides: { REDIS_URL: "redis://cache:6379" },
    });
    expect(service).not.toHaveProperty("dockerfile");
    expect(service).not.toHaveProperty("healthCheckPath");
    expect(existsSync(join(tempDir, "services", "hqc", "cache", "Dockerfile"))).toBe(false);
  });

  it("writes a Qdrant and a RabbitMQ whose volumes do not collide", async () => {
    const vectors = await create("vectors", "qdrant");
    const queue = await create("queue", "rabbitmq");
    expect(vectors).toMatchObject({
      port: 6333,
      healthCheck: { port: 6333 },
      volumes: [{ source: "vectors-data", target: "/qdrant/storage" }],
      provides: { QDRANT_URL: "http://vectors:6333" },
    });
    expect(queue).toMatchObject({
      port: 5672,
      healthCheck: { command: ["rabbitmq-diagnostics", "-q", "ping"] },
      volumes: [{ source: "queue-data", target: "/var/lib/rabbitmq" }],
      params: { RABBITMQ_NODENAME: "rabbit@localhost" },
      provides: { AMQP_URL: "amqp://guest:guest@queue:5672" },
    });
  });

  it("writes a service.json that validates", async () => {
    for (const [name, type] of [
      ["cache", "redis"],
      ["vectors", "qdrant"],
      ["queue", "rabbitmq"],
    ]) {
      const service = await create(name, type);
      expect(validateServiceManifest(service, `services/hqc/${name}/service.json`).errors).toEqual(
        [],
      );
    }
  });

  it("lets --image replace the pinned image", async () => {
    const service = await create("cache", "redis", ["--image", "redis:8-alpine"]);
    expect(service).toMatchObject({ image: "redis:8-alpine", port: 6379 });
  });

  it("refuses --port, because the image listens on its own port", () => {
    expect(() => assertInfraPresetOptions("redis", { port: "7000" })).toThrow(
      "--port cannot be used with --type redis: the image listens on 6379.",
    );
    expect(() => assertInfraPresetOptions("qdrant", {})).not.toThrow();
  });
});

describe("providesErrors", () => {
  const file = "services/hqc/cache/service.json";

  it("accepts connection URLs and an absent value", () => {
    expect(providesErrors({}, file)).toEqual([]);
    expect(
      providesErrors(
        {
          provides: { REDIS_URL: "redis://cache:6379", AMQP_URL: "amqp://guest:guest@queue:5672" },
        },
        file,
      ),
    ).toEqual([]);
  });

  it.each([
    [["redis://cache:6379"], "provides: expected an object"],
    [
      { "redis-url": "redis://cache:6379" },
      "provides.redis-url: expected an environment variable name",
    ],
    [{ REDIS_URL: 6379 }, "provides.REDIS_URL: expected a URL"],
    [{ REDIS_URL: "redis://cache:6379\nEVIL=1" }, "provides.REDIS_URL: expected a URL"],
    [{ REDIS_URL: "redis://:$REDIS_PASSWORD@cache" }, "provides.REDIS_URL: expected a URL"],
  ])("refuses %j", (provides, message) => {
    const errors = providesErrors({ provides }, file);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(message);
  });
});
