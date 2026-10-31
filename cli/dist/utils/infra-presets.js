// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { INFRA_RESOURCE_TYPES } from "../types/index.js";
import { SERVICE_MANIFEST_SCHEMA_URL, SERVICE_MANIFEST_SCHEMA_VERSION, } from "./service-manifest.js";
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
    minio: {
        description: "MinIO S3-compatible object storage",
        // MinIO no longer publishes community images (quay.io needs a login, Docker Hub has none). Chainguard's free tier
        // publishes only `latest`; pass --image to pin a digest or use your own build.
        image: "cgr.dev/chainguard/minio:latest",
        port: 9000,
        healthCheck: { port: 9000 },
        dataPath: "/data",
        startCommand: ["server", "/data", "--console-address", ":9001"],
        // Development-only credentials; the service is reachable only on the stack's Docker network.
        params: { MINIO_ROOT_USER: "minioadmin", MINIO_ROOT_PASSWORD: "minioadmin" },
        provides: { MINIO_ENDPOINT_URL: "http://{name}:9000" },
    },
    mlflow: {
        description: "MLflow tracking server",
        image: "ghcr.io/mlflow/mlflow:v2.17.2",
        port: 5000,
        healthCheck: { port: 5000 },
        dataPath: "/mlflow",
        startCommand: [
            "mlflow",
            "server",
            "--host",
            "0.0.0.0",
            "--port",
            "5000",
            "--backend-store-uri",
            "sqlite:////mlflow/mlflow.db",
            "--default-artifact-root",
            "/mlflow/artifacts",
        ],
        provides: { MLFLOW_TRACKING_URI: "http://{name}:5000" },
    },
};
export function isInfraPreset(value) {
    return typeof value === "string" && INFRA_RESOURCE_TYPES.includes(value);
}
/** The service.json of an infrastructure preset. `image` replaces the pinned image (for example redis:8-alpine). */
export function createInfraServiceJson(name, stack, presetId, image) {
    const preset = INFRA_PRESETS[presetId];
    return {
        $schema: SERVICE_MANIFEST_SCHEMA_URL,
        schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION,
        appName: name,
        appType: "bring-your-own",
        stack,
        port: preset.port,
        ...(preset.startCommand ? { dockerfile: "./Dockerfile" } : { image: image ?? preset.image }),
        exposeViaProxy: false,
        healthCheck: preset.healthCheck,
        volumes: [{ source: `${name}-data`, target: preset.dataPath }],
        ...(preset.params ? { params: { ...preset.params } } : {}),
        provides: Object.fromEntries(Object.entries(preset.provides).map(([key, value]) => [key, value.replace("{name}", name)])),
    };
}
/** The Dockerfile of a preset whose image needs a start command, or undefined when the pinned image is used as it is. */
export function createInfraDockerfile(presetId, image) {
    const preset = INFRA_PRESETS[presetId];
    if (!preset.startCommand)
        return undefined;
    return `FROM ${image ?? preset.image}\nCMD ${JSON.stringify(preset.startCommand)}\n`;
}
