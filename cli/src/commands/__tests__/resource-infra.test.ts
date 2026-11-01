// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertInfraFramework,
  assertInfraPresetOptions,
  parseResourceType,
  resourceCommand,
} from "../../commands/resource.js";
import { providesErrors, validateServiceManifest } from "../../utils/service-manifest.js";

const jsonOutput = vi.hoisted(() => ({ createJsonEmitter: vi.fn() }));
vi.mock("../../utils/json-output.js", () => ({ ...jsonOutput }));

import { clearDiscoveryCache } from "../../utils/discovery-context.js";

const originalCwd = process.cwd();

describe("infrastructure frameworks (--type database|queue --framework ...)", () => {
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

  async function create(name: string, type: string, framework?: string, args: string[] = []) {
    const originalLog = console.log;
    console.log = () => {};
    try {
      await resourceCommand.parseAsync(
        [
          "node",
          "flisk",
          name,
          "--type",
          type,
          ...(framework ? ["--framework", framework] : []),
          "--stack",
          "hqc",
          "--yes",
          ...args,
        ],
        { from: "node" },
      );
    } finally {
      console.log = originalLog;
    }
    clearDiscoveryCache();
    const dir = join(tempDir, "services", "hqc", name);
    return JSON.parse(readFileSync(join(dir, "service.json"), "utf-8")) as Record<string, unknown>;
  }

  it("keeps database and queue as types of their own", () => {
    expect(parseResourceType("database")).toBe("database");
    expect(parseResourceType("queue")).toBe("queue");
  });

  it.each([
    ["redis", "--type database --framework redis"],
    ["qdrant", "--type database --framework qdrant"],
    ["minio", "--type database --framework minio"],
    ["mlflow", "--type database --framework mlflow"],
    ["rabbitmq", "--type queue --framework rabbitmq"],
  ])("--type %s was a preset and is a framework now: %s", (type, replacement) => {
    expect(() => parseResourceType(type)).toThrow(`${type} is a framework: use ${replacement}.`);
  });

  it("writes a Redis with a probe, its own data volume and the REDIS_URL it provides", async () => {
    const service = await create("cache", "database", "redis");
    expect(service).toMatchObject({
      appName: "cache",
      appType: "bring-your-own",
      framework: "redis",
      stack: "hqc",
      port: 6379,
      image: "redis:7.4-alpine",
      exposeViaProxy: false,
      healthCheck: { command: ["redis-cli", "ping"] },
      volumes: [{ source: "cache-data", target: "/data" }],
      provides: { REDIS_URL: "redis://cache:6379" },
    });
    for (const key of ["dockerfile", "healthCheckPath", "extraPorts", "container"]) {
      expect(service).not.toHaveProperty(key);
    }
    expect(existsSync(join(tempDir, "services", "hqc", "cache", "Dockerfile"))).toBe(false);
  });

  it("keeps --type database on its own the shared Postgres", async () => {
    const service = await create("db", "database");
    expect(service).toMatchObject({ appType: "database", framework: "postgres" });
    expect(service).not.toHaveProperty("image");
    expect((await create("db2", "database", "postgres")).appType).toBe("database");
  });

  it("publishes the UI of Qdrant, RabbitMQ and MinIO on 127.0.0.1 only through extraPorts", async () => {
    const vectors = await create("vectors", "database", "qdrant");
    const broker = await create("broker", "queue", "rabbitmq");
    const store = await create("store", "database", "minio");
    expect(vectors).toMatchObject({
      framework: "qdrant",
      port: 6333,
      healthCheck: { port: 6333 },
      extraPorts: [{ port: 6333 }],
      volumes: [{ source: "vectors-data", target: "/qdrant/storage" }],
      provides: { QDRANT_URL: "http://vectors:6333" },
    });
    expect(broker).toMatchObject({
      framework: "rabbitmq",
      port: 5672,
      healthCheck: { command: ["rabbitmq-diagnostics", "-q", "ping"] },
      extraPorts: [{ port: 15672 }],
      volumes: [{ source: "broker-data", target: "/var/lib/rabbitmq" }],
      params: { RABBITMQ_NODENAME: "rabbit@localhost" },
      provides: { AMQP_URL: "amqp://guest:guest@broker:5672" },
    });
    expect(store).toMatchObject({ extraPorts: [{ port: 9001 }] });
    // No `bind`: the engine publishes on loopback unless service.json opts in to 0.0.0.0.
    for (const service of [vectors, broker, store]) {
      expect(JSON.stringify(service.extraPorts)).not.toContain("bind");
    }
  });

  it("writes MinIO with a start command, the community image and the S3 settings it provides", async () => {
    const store = await create("store", "database", "minio");
    expect(store).toMatchObject({
      framework: "minio",
      port: 9000,
      image: expect.stringMatching(/^pgsty\/minio:RELEASE\./),
      container: { command: ["server", "/data", "--console-address", ":9001"] },
      healthCheck: { port: 9000 },
      params: { MINIO_ROOT_USER: "minioadmin", MINIO_ROOT_PASSWORD: "minioadmin" },
      volumes: [{ source: "store-data", target: "/data" }],
      provides: {
        MINIO_ENDPOINT: "http://store:9000",
        AWS_ENDPOINT_URL_S3: "http://store:9000",
        AWS_ACCESS_KEY_ID: "minioadmin",
        AWS_SECRET_ACCESS_KEY: "minioadmin",
      },
    });
    expect(store).not.toHaveProperty("dockerfile");
    expect(existsSync(join(tempDir, "services", "hqc", "store", "Dockerfile"))).toBe(false);
  });

  it("writes MLflow whose start command picks S3 when a MinIO is a dependency and the volume otherwise", async () => {
    const tracking = await create("tracking", "database", "mlflow");
    expect(tracking).toMatchObject({
      framework: "mlflow",
      port: 5000,
      image: "ghcr.io/mlflow/mlflow:v3.17.2",
      extraPorts: [{ port: 5000 }],
      healthCheck: { port: 5000 },
      volumes: [{ source: "tracking-data", target: "/data" }],
      provides: { MLFLOW_TRACKING_URI: "http://tracking:5000" },
    });
    const [shell, flag, script] = (tracking.container as { command: string[] }).command;
    expect([shell, flag]).toEqual(["sh", "-c"]);
    // Compose turns $$ into $ for the shell in the container.
    expect(script).toContain('if [ -n "$$AWS_ENDPOINT_URL_S3" ]');
    expect(script).toContain("pip install -q boto3");
    expect(script).toContain("DEST=s3://mlflow");
    expect(script).toContain("else DEST=/data/artifacts");
    expect(script).toContain("create_bucket(Bucket='mlflow')");
    expect(script).toContain("exec mlflow server --host 0.0.0.0 --port 5000");
    expect(script).toContain("--backend-store-uri sqlite:////data/mlflow.db");
    // Artifacts go through the tracking server, so a run's URI is mlflow-artifacts:/ and not a path on the client's disk.
    expect(script).toContain('--serve-artifacts --artifacts-destination "$$DEST"');
    // A client in another container sends the resource name as Host, which MLflow 3 refuses unless it is listed.
    expect(script).toContain('--allowed-hosts "tracking:5000,tracking,');
    expect(script).not.toContain("{name}");
    expect((tracking.container as { memory: string }).memory).toBe("3g");
    expect(script).not.toContain("--default-artifact-root");
  });

  it("writes NATS (the default queue) with JetStream on the data volume", async () => {
    const bus = await create("bus", "queue");
    expect(bus).toMatchObject({
      framework: "nats",
      port: 4222,
      image: "nats:2.11.8-alpine",
      healthCheck: { port: 4222 },
      container: { command: ["-js", "-sd", "/data", "-m", "8222"] },
      volumes: [{ source: "bus-data", target: "/data" }],
      provides: { NATS_URL: "nats://bus:4222" },
    });
    expect(bus).not.toHaveProperty("extraPorts");
    expect((await create("bus2", "queue", "nats")).framework).toBe("nats");
  });

  it("writes a service.json that validates, for every framework", async () => {
    const all: Array<[string, string, string]> = [
      ["cache", "database", "redis"],
      ["vectors", "database", "qdrant"],
      ["store", "database", "minio"],
      ["tracking", "database", "mlflow"],
      ["bus", "queue", "nats"],
      ["broker", "queue", "rabbitmq"],
    ];
    for (const [name, type, framework] of all) {
      const service = await create(name, type, framework);
      expect(validateServiceManifest(service, `services/hqc/${name}/service.json`).errors).toEqual(
        [],
      );
    }
  });

  it("lets --image replace the pinned image", async () => {
    const service = await create("cache", "database", "redis", ["--image", "redis:8-alpine"]);
    expect(service).toMatchObject({ image: "redis:8-alpine", port: 6379 });
  });

  it("refuses a framework of the other type, naming the one that offers it", () => {
    expect(() => assertInfraFramework("database", "rabbitmq")).toThrow(
      "--framework rabbitmq is not a database Flisk can run. Use one of: postgres, redis, qdrant, minio, mlflow.",
    );
    expect(() => assertInfraFramework("queue", "redis")).toThrow(
      "--framework redis is not a queue Flisk can run. Use one of: nats, rabbitmq.",
    );
    expect(() => assertInfraFramework("queue", "kafka")).toThrow("Use one of: nats, rabbitmq");
    expect(() => assertInfraFramework("database", "postgres")).not.toThrow();
    expect(() => assertInfraFramework("queue", undefined)).not.toThrow();
  });

  it("refuses --framework redis on a backend, as before: it names app frameworks", async () => {
    await expect(create("api", "backend", "redis")).rejects.toThrow("process.exit");
  });

  it("refuses an --image that is not one image reference", () => {
    for (const image of ["minio/minio latest", "minio/minio\nRUN x", 'a"b']) {
      expect(() => assertInfraPresetOptions("minio", { image })).toThrow(
        "--image must be an image reference",
      );
    }
    expect(() =>
      assertInfraPresetOptions("minio", { image: "ghcr.io/acme/minio:1.0@sha256:abc" }),
    ).not.toThrow();
  });

  it("refuses --port, because the image listens on its own port", () => {
    expect(() => assertInfraPresetOptions("redis", { port: "7000" })).toThrow(
      "--port cannot be used with --framework redis: the image listens on 6379.",
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
