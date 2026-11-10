// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir } from "../../test-support/index.js";
import { carryOverBuildCommand, syncImportedManifestCommands } from "../import.js";

describe("compose import validation: real-world patterns", () => {
  it("translates multi-service dependencies and keeps database ports private", () => {
    const rawServices = {
      broker: {
        appName: "broker",
        appType: "bring-your-own",
        image: "docker.io/valkey/valkey:9-alpine",
        port: 4000,
        exposeViaProxy: false,
        restart: "unless-stopped",
      },
      db: {
        appName: "db",
        appType: "bring-your-own",
        image: "docker.io/library/postgres:18",
        port: 4001,
        exposeViaProxy: false,
        secrets: { required: ["POSTGRES_PASSWORD"] },
      },
      webserver: {
        appName: "webserver",
        appType: "bring-your-own",
        image: "ghcr.io/paperless-ngx/paperless-ngx:latest",
        port: 8000,
        healthCheckPath: "/",
        dependsOn: [
          { name: "broker", condition: "service_started" },
          { name: "db", condition: "service_started" },
        ],
        extraPorts: [{ port: 8000, publish: "8000" }],
      },
    };

    expect(rawServices.broker.exposeViaProxy).toBe(false);
    expect(rawServices.db.exposeViaProxy).toBe(false);
    expect(rawServices.webserver.dependsOn).toHaveLength(2);
    expect(rawServices.webserver.dependsOn[0].name).toBe("broker");
    expect(rawServices.webserver.dependsOn[1].name).toBe("db");
    expect(rawServices.db.secrets.required).toContain("POSTGRES_PASSWORD");
  });

  it("preserves container user overrides for postgres and redis services", () => {
    const postgresManifest = {
      appName: "postgres",
      appType: "bring-your-own",
      port: 5432,
      image: "postgres",
      exposeViaProxy: false,
      container: {
        user: "postgres:postgres",
      },
      extraPorts: [{ port: 5432 }],
    };

    const redisManifest = {
      appName: "redis",
      appType: "bring-your-own",
      port: 6379,
      image: "redis",
      exposeViaProxy: false,
      container: {
        user: "redis:redis",
      },
      extraPorts: [{ port: 6379 }],
    };

    expect(postgresManifest.container.user).toBe("postgres:postgres");
    expect(redisManifest.container.user).toBe("redis:redis");
    expect(postgresManifest.extraPorts[0].port).toBe(5432);
    expect(redisManifest.extraPorts[0].port).toBe(6379);
  });

  it("preserves healthcheck commands and resource limits", () => {
    const appManifest = {
      appName: "app",
      appType: "bring-your-own",
      port: 3000,
      healthCheckPath: "/api/v1/health",
      healthCheck: {
        command: ["curl", "-f", "http://localhost:3000/api/v1/health"],
        interval: 10,
        timeout: 5,
        retries: 3,
      },
      container: {
        cpus: 2,
        memory: "1G",
      },
      extraPorts: [
        { port: 3000, hostPort: 8080 },
        { port: 9090, publish: "9090", protocol: "udp" },
      ],
    };

    expect(appManifest.healthCheck.command).toEqual([
      "curl",
      "-f",
      "http://localhost:3000/api/v1/health",
    ]);
    expect(appManifest.container.cpus).toBe(2);
    expect(appManifest.container.memory).toBe("1G");
    expect(appManifest.extraPorts[1].protocol).toBe("udp");
  });

  it("carries over build command to container.command and removes top-level command", () => {
    const rawManifest = {
      appName: "backend",
      appType: "bring-your-own",
      buildContext: "./api",
      dockerfile: "Dockerfile.custom",
      command: "npm run start:prod",
    };

    const normalized = carryOverBuildCommand(rawManifest);
    expect(normalized.container).toBeDefined();
    expect((normalized.container as Record<string, unknown>).command).toEqual([
      "npm",
      "run",
      "start:prod",
    ]);
    expect(normalized.command).toBeUndefined();
  });

  it("syncs imported manifest files on disk", () => {
    const tempDir = createTempDir();
    const servicePath = path.join(tempDir, "service.json");
    fs.writeFileSync(
      servicePath,
      JSON.stringify(
        {
          appName: "worker",
          appType: "bring-your-own",
          buildContext: ".",
          dockerfile: "Dockerfile",
          command: ["python", "-m", "celery", "worker"],
        },
        null,
        2,
      ),
    );

    syncImportedManifestCommands([servicePath]);

    const updated = JSON.parse(fs.readFileSync(servicePath, "utf-8"));
    expect(updated.container?.command).toEqual(["python", "-m", "celery", "worker"]);
    expect(updated.command).toBeUndefined();
  });
});
