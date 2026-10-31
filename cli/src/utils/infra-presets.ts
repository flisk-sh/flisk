// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { INFRA_RESOURCE_TYPES, type InfraResourceType } from "../types/index.js";
import {
  SERVICE_MANIFEST_SCHEMA_URL,
  SERVICE_MANIFEST_SCHEMA_VERSION,
} from "./service-manifest.js";

/**
 * `flisk resource <name> --type redis|qdrant|rabbitmq`: bring-your-own presets for the infrastructure an agent or ML stack
 * needs next to Flisk's Postgres and NATS (a cache or job queue, a vector store, a message broker). Each one is a pinned
 * image with a readiness probe, a named data volume that `flisk down` keeps, and `provides`: the connection settings every
 * service that lists it in `dependsOn` gets in its environment. None of them is published on the host or routed by Traefik;
 * the services in the stack reach them on the Docker network by name.
 */
export interface InfraPreset {
  /** What it is, for `flisk resource --help` and the created message. */
  description: string;
  image: string;
  /** The port the image listens on inside the container. */
  port: number;
  /** service.json `healthCheck`: a TCP port or a command, since none of these serves the Flisk health route. */
  healthCheck: { port: number } | { command: string[] };
  /** Where the image keeps its data; mounted from the named volume `<name>-data`. */
  dataPath: string;
  /** Non-secret settings for the image itself (service.json `params`). */
  params?: Record<string, string>;
  /** service.json `provides`, with `{name}` replaced by the resource name (its host name on the Docker network). */
  provides: Record<string, string>;
}

export const INFRA_PRESETS = {
  redis: {
    description: "Redis cache and job queue",
    image: "redis:7.4-alpine",
    port: 6379,
    healthCheck: { command: ["redis-cli", "ping"] },
    dataPath: "/data",
    provides: { REDIS_URL: "redis://{name}:6379" },
  },
  qdrant: {
    description: "Qdrant vector database",
    image: "qdrant/qdrant:v1.12.5",
    port: 6333,
    healthCheck: { port: 6333 },
    dataPath: "/qdrant/storage",
    provides: { QDRANT_URL: "http://{name}:6333" },
  },
  rabbitmq: {
    description: "RabbitMQ message broker",
    image: "rabbitmq:4.1-management-alpine",
    port: 5672,
    healthCheck: { command: ["rabbitmq-diagnostics", "-q", "ping"] },
    dataPath: "/var/lib/rabbitmq",
    params: {
      // The data directory is named after the node, and the container's host name changes whenever it is recreated.
      RABBITMQ_NODENAME: "rabbit@localhost",
      // RabbitMQ's default guest account only accepts connections from localhost. The broker is reachable only on the
      // stack's Docker network, so the other containers may use it too.
      RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS: "-rabbit loopback_users []",
    },
    provides: { AMQP_URL: "amqp://guest:guest@{name}:5672" },
  },
} as const satisfies Record<InfraResourceType, InfraPreset>;

export function isInfraPreset(value: unknown): value is InfraResourceType {
  return typeof value === "string" && (INFRA_RESOURCE_TYPES as readonly string[]).includes(value);
}

/** The service.json of an infrastructure preset. `image` replaces the pinned image (for example redis:8-alpine). */
export function createInfraServiceJson(
  name: string,
  stack: string,
  presetId: InfraResourceType,
  image?: string,
): Record<string, unknown> {
  const preset: InfraPreset = INFRA_PRESETS[presetId];
  return {
    $schema: SERVICE_MANIFEST_SCHEMA_URL,
    schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION,
    appName: name,
    appType: "bring-your-own",
    stack,
    port: preset.port,
    image: image ?? preset.image,
    exposeViaProxy: false,
    healthCheck: preset.healthCheck,
    volumes: [{ source: `${name}-data`, target: preset.dataPath }],
    ...(preset.params ? { params: { ...preset.params } } : {}),
    provides: Object.fromEntries(
      Object.entries(preset.provides).map(([key, value]) => [key, value.replace("{name}", name)]),
    ),
  };
}
