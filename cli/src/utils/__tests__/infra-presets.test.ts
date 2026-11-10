// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  createInfraServiceJson,
  infraFrameworkFor,
  isInfraFramework,
  replacementForRemovedType,
} from "../infra-presets.js";

describe("the replacement for a removed preset type", () => {
  it("points at the framework that replaced the type", () => {
    expect(replacementForRemovedType("redis")).toBe("--type database --framework redis");
    expect(replacementForRemovedType("minio")).toBe("--type database --framework minio");
  });

  it("is undefined for a type that was never a preset", () => {
    expect(replacementForRemovedType("backend")).toBeUndefined();
    expect(replacementForRemovedType("")).toBeUndefined();
  });
});

describe("the framework type guard", () => {
  it("accepts a framework name", () => {
    expect(isInfraFramework("redis")).toBe(true);
    expect(isInfraFramework("nats")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isInfraFramework("postgres")).toBe(false);
    expect(isInfraFramework(42)).toBe(false);
    expect(isInfraFramework(undefined)).toBe(false);
  });
});

describe("the framework a type and framework select", () => {
  it("gives a queue its default framework when none is given", () => {
    expect(infraFrameworkFor("queue", undefined)).toBe("nats");
    expect(infraFrameworkFor("queue", "rabbitmq")).toBe("rabbitmq");
  });

  it("gives a database the framework that was asked for", () => {
    expect(infraFrameworkFor("database", "redis")).toBe("redis");
    expect(infraFrameworkFor("database", "qdrant")).toBe("qdrant");
  });

  it("gives the shared Postgres no framework", () => {
    expect(infraFrameworkFor("database", undefined)).toBeUndefined();
    expect(infraFrameworkFor("database", "postgres")).toBeUndefined();
  });

  it("gives no framework to any other type", () => {
    expect(infraFrameworkFor("backend", undefined)).toBeUndefined();
    expect(infraFrameworkFor("backend", "redis")).toBeUndefined();
  });
});

describe("the service.json of an infrastructure preset", () => {
  it("names the service, its stack and its framework", () => {
    const service = createInfraServiceJson("cache", "app", "redis");

    expect(service.appName).toBe("cache");
    expect(service.appType).toBe("bring-your-own");
    expect(service.framework).toBe("redis");
    expect(service.stack).toBe("app");
  });

  it("keeps the pinned image, port and health check of the preset", () => {
    const service = createInfraServiceJson("cache", "app", "redis");

    expect(service.image).toBe("redis:7.4-alpine");
    expect(service.port).toBe(6379);
    expect(service.healthCheck).toEqual({ command: ["redis-cli", "ping"] });
  });

  it("replaces the pinned image when one is given", () => {
    const service = createInfraServiceJson("cache", "app", "redis", "redis:8-alpine");

    expect(service.image).toBe("redis:8-alpine");
  });

  it("mounts a data volume named after the service", () => {
    const service = createInfraServiceJson("cache", "app", "redis");

    expect(service.volumes).toEqual([{ source: "cache-data", target: "/data" }]);
  });

  it("gives the services that depend on it the connection settings", () => {
    const service = createInfraServiceJson("cache", "app", "redis");

    expect(service.provides).toEqual({ REDIS_URL: "redis://cache:6379" });
  });
});
