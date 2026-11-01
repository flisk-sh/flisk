// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { DATABASE_INFRA_FRAMEWORKS, DATABASE_RESOURCE_TYPE, DEFAULT_QUEUE_FRAMEWORK, QUEUE_FRAMEWORKS, QUEUE_RESOURCE_TYPE, } from "../types/index.js";
import { SERVICE_MANIFEST_SCHEMA_URL, SERVICE_MANIFEST_SCHEMA_VERSION, } from "./service-manifest.js";
const MINIO_USER = "minioadmin";
const MINIO_PASSWORD = "minioadmin";
/**
 * MLflow's start command (Compose passes it to the container; `$$` is a literal `$` for the shell inside). With a MinIO in
 * `dependsOn`, its `provides` (AWS_ENDPOINT_URL_S3 and the keys) reach this container: artifacts then go to the bucket
 * `mlflow`, created when missing. Without one they stay in the data volume. `--serve-artifacts` makes the server the only
 * thing its clients need to reach (MLFLOW_TRACKING_URI). MLflow 3 answers 403 to a Host header it does not know, and a client
 * in another container sends the resource name, so `--allowed-hosts` lists it (`{name}`) next to the loopback and private
 * addresses it allows by default. One worker, because each of the four default ones costs about 400 MB.
 */
const MLFLOW_START_SCRIPT = [
    'if [ -n "$$AWS_ENDPOINT_URL_S3" ]',
    "then pip install -q boto3",
    "n=0",
    `until python3 -c "import boto3; s=boto3.client('s3'); b=[x['Name'] for x in s.list_buckets()['Buckets']]; 'mlflow' in b or s.create_bucket(Bucket='mlflow')"; do n=$$((n+1)); [ $$n -gt 30 ] && exit 1; sleep 2; done`,
    "DEST=s3://mlflow",
    "else DEST=/data/artifacts",
    "fi",
    'exec mlflow server --host 0.0.0.0 --port 5000 --backend-store-uri sqlite:////data/mlflow.db --workers 1 --allowed-hosts "{name}:5000,{name},localhost:*,127.0.0.1:*,10.*,172.*,192.168.*" --serve-artifacts --artifacts-destination "$$DEST"',
].join("; ");
export const INFRA_PRESETS = {
    redis: {
        type: DATABASE_RESOURCE_TYPE,
        description: "Redis cache and job queue",
        image: "redis:7.4-alpine",
        port: 6379,
        healthCheck: { command: ["redis-cli", "ping"] },
        dataPath: "/data",
        provides: { REDIS_URL: "redis://{name}:6379" },
    },
    qdrant: {
        type: DATABASE_RESOURCE_TYPE,
        description: "Qdrant vector database",
        image: "qdrant/qdrant:v1.12.5",
        port: 6333,
        healthCheck: { port: 6333 },
        dataPath: "/qdrant/storage",
        // The REST API and the dashboard (/dashboard) share port 6333.
        uiPorts: [6333],
        provides: { QDRANT_URL: "http://{name}:6333" },
    },
    minio: {
        type: DATABASE_RESOURCE_TYPE,
        description: "MinIO S3-compatible object storage",
        // MinIO stopped publishing images (minio/minio and quay.io/minio/minio). pgsty/minio is a community fork of the last
        // open-source release with the same CLI and S3 API, pinned here; pass --image to use another build.
        image: "pgsty/minio:RELEASE.2026-08-04T00-00-00Z",
        port: 9000,
        healthCheck: { port: 9000 },
        dataPath: "/data",
        command: ["server", "/data", "--console-address", ":9001"],
        uiPorts: [9001],
        // Development-only credentials; the S3 port is reachable on the stack's Docker network only.
        params: { MINIO_ROOT_USER: MINIO_USER, MINIO_ROOT_PASSWORD: MINIO_PASSWORD },
        provides: {
            MINIO_ENDPOINT: "http://{name}:9000",
            AWS_ENDPOINT_URL_S3: "http://{name}:9000",
            AWS_ACCESS_KEY_ID: MINIO_USER,
            AWS_SECRET_ACCESS_KEY: MINIO_PASSWORD,
        },
    },
    mlflow: {
        type: DATABASE_RESOURCE_TYPE,
        description: "MLflow tracking server",
        image: "ghcr.io/mlflow/mlflow:v3.17.2",
        port: 5000,
        healthCheck: { port: 5000 },
        dataPath: "/data",
        command: ["sh", "-c", MLFLOW_START_SCRIPT],
        memory: "3g",
        // The tracking API and the UI share port 5000.
        uiPorts: [5000],
        provides: { MLFLOW_TRACKING_URI: "http://{name}:5000" },
    },
    nats: {
        type: QUEUE_RESOURCE_TYPE,
        description: "NATS message queue with JetStream",
        image: "nats:2.11.8-alpine",
        port: 4222,
        healthCheck: { port: 4222 },
        dataPath: "/data",
        // JetStream persists to the data volume; the monitoring endpoint (8222) stays inside the Docker network.
        command: ["-js", "-sd", "/data", "-m", "8222"],
        provides: { NATS_URL: "nats://{name}:4222" },
    },
    rabbitmq: {
        type: QUEUE_RESOURCE_TYPE,
        description: "RabbitMQ message broker",
        image: "rabbitmq:4.1-management-alpine",
        port: 5672,
        healthCheck: { command: ["rabbitmq-diagnostics", "-q", "ping"] },
        dataPath: "/var/lib/rabbitmq",
        // The management UI.
        uiPorts: [15672],
        params: {
            // The data directory is named after the node, and the container's host name changes whenever it is recreated.
            RABBITMQ_NODENAME: "rabbit@localhost",
            // RabbitMQ's default guest account only accepts connections from localhost. The broker is reachable only on the
            // stack's Docker network, so the other containers may use it too.
            RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS: "-rabbit loopback_users []",
        },
        provides: { AMQP_URL: "amqp://guest:guest@{name}:5672" },
    },
};
/** Types that used to be presets (1.4.24) and now are a framework of `database` or `queue`. */
const REMOVED_PRESET_TYPES = {
    redis: "redis",
    qdrant: "qdrant",
    rabbitmq: "rabbitmq",
    minio: "minio",
    mlflow: "mlflow",
};
/** The `--type ... --framework ...` that replaces a removed preset type, or undefined when `type` was never one. */
export function replacementForRemovedType(type) {
    const framework = REMOVED_PRESET_TYPES[type];
    return framework ? `--type ${INFRA_PRESETS[framework].type} --framework ${framework}` : undefined;
}
export function isInfraFramework(value) {
    return typeof value === "string" && Object.hasOwn(INFRA_PRESETS, value);
}
/**
 * The preset `--type database|queue` with `--framework` selects, or undefined for the shared Postgres (`--type database`
 * with no framework or `postgres`). A queue without `--framework` is NATS. Throws nothing: assertInfraFramework reports a
 * wrong combination.
 */
export function infraFrameworkFor(type, framework) {
    if (type === QUEUE_RESOURCE_TYPE) {
        return (framework ?? DEFAULT_QUEUE_FRAMEWORK);
    }
    return type === DATABASE_RESOURCE_TYPE && isInfraFramework(framework) ? framework : undefined;
}
/** The frameworks `type` accepts, in the order the help lists them. */
export function frameworksOfType(type) {
    return type === QUEUE_RESOURCE_TYPE ? QUEUE_FRAMEWORKS : DATABASE_INFRA_FRAMEWORKS;
}
/** The service.json of an infrastructure preset. `image` replaces the pinned image (for example redis:8-alpine). */
export function createInfraServiceJson(name, stack, framework, image) {
    const preset = INFRA_PRESETS[framework];
    return {
        $schema: SERVICE_MANIFEST_SCHEMA_URL,
        schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION,
        appName: name,
        appType: "bring-your-own",
        framework,
        stack,
        port: preset.port,
        image: image ?? preset.image,
        exposeViaProxy: false,
        healthCheck: preset.healthCheck,
        ...(preset.command || preset.memory
            ? {
                container: {
                    ...(preset.command
                        ? { command: preset.command.map((part) => part.replaceAll("{name}", name)) }
                        : {}),
                    ...(preset.memory ? { memory: preset.memory } : {}),
                },
            }
            : {}),
        ...(preset.uiPorts ? { extraPorts: preset.uiPorts.map((port) => ({ port })) } : {}),
        volumes: [{ source: `${name}-data`, target: preset.dataPath }],
        ...(preset.params ? { params: { ...preset.params } } : {}),
        provides: Object.fromEntries(Object.entries(preset.provides).map(([key, value]) => [key, value.replace("{name}", name)])),
    };
}
