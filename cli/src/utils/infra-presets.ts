// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import {
  DATABASE_INFRA_FRAMEWORKS,
  DATABASE_RESOURCE_TYPE,
  type InfraFramework,
  type InfraResourceType,
  MAIL_RESOURCE_TYPE,
  PAYMENTS_RESOURCE_TYPE,
  PRESET_RESOURCE_TYPES,
  type PresetResourceType,
  QUEUE_RESOURCE_TYPE,
  STORAGE_RESOURCE_TYPE,
} from "../types/index.js";
import {
  SERVICE_MANIFEST_SCHEMA_URL,
  SERVICE_MANIFEST_SCHEMA_VERSION,
} from "./service-manifest.js";

/**
 * Infrastructure frameworks: `flisk resource <name> --type database --framework redis|qdrant|mlflow|...`,
 * `--type queue --framework nats|rabbitmq`, `--type storage --framework minio`, `--type mail --framework mailpit` and
 * `--type payments --framework stripe-mock` (the shared Postgres is `--type database` on its own). A preset's `type` must be the type that lists it in types/index.ts. Each is a pinned image
 * with a readiness probe, a named data volume that `flisk down` keeps, and `provides`: the connection settings every
 * service that lists it in `dependsOn` gets in its environment. Services in the stack reach it on the Docker network by
 * name. A framework with a web UI also publishes it on 127.0.0.1 only (`extraPorts`); two resources of one framework
 * collide on that host port, so change `hostPort` in one service.json. The service.json is a plain bring-your-own one
 * with `framework` recorded: the engine does not know these frameworks.
 */
export interface InfraPreset {
  /** The resource type that offers it. */
  type: InfraResourceType;
  /** What it is, for `flisk resource --help` and the created message. */
  description: string;
  image: string;
  /** The port the image listens on inside the container. */
  port: number;
  /** service.json `healthCheck`: a TCP port or a command, since none of these serves the Flisk health route. */
  healthCheck: { port: number } | { command: string[] };
  /** Where the image keeps its data; mounted from the named volume `<name>-data`. Left out for a stateless emulator. */
  dataPath?: string;
  /** Non-secret settings for the image itself (service.json `params`). */
  params?: Record<string, string>;
  /** service.json `container.command` (`{name}` replaced), for an image whose default command does not start the server the way Flisk needs. */
  command?: string[];
  /** service.json `container.memory`, for an image that needs more than Flisk's default 512M. */
  memory?: string;
  /** The web UI, published on 127.0.0.1 (service.json `extraPorts`). */
  uiPorts?: number[];
  /** service.json `provides`, with `{name}` replaced by the resource name (its host name on the Docker network). */
  provides: Record<string, string>;
}

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
    type: STORAGE_RESOURCE_TYPE,
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
  mysql: {
    type: DATABASE_RESOURCE_TYPE,
    description: "MySQL database",
    image: "mysql:8.4",
    port: 3306,
    // The probe logs in with the development password below, so a server that is up but not yet initialised is not ready.
    healthCheck: { command: ["mysqladmin", "ping", "-h", "127.0.0.1", "-uroot", "-pflisk"] },
    dataPath: "/var/lib/mysql",
    memory: "1g",
    // Development-only credentials; the server is reachable on the stack's Docker network only.
    params: { MYSQL_ROOT_PASSWORD: "flisk", MYSQL_DATABASE: "app" },
    provides: { MYSQL_URL: "mysql://root:flisk@{name}:3306/app" },
  },
  mongodb: {
    type: DATABASE_RESOURCE_TYPE,
    description: "MongoDB document database",
    image: "mongo:8.0",
    port: 27017,
    healthCheck: { command: ["mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"] },
    dataPath: "/data/db",
    memory: "1g",
    // No authentication: the server is reachable on the stack's Docker network only.
    provides: { MONGODB_URL: "mongodb://{name}:27017" },
  },
  clickhouse: {
    type: DATABASE_RESOURCE_TYPE,
    description: "ClickHouse analytics database",
    image: "clickhouse/clickhouse-server:25.8-alpine",
    port: 8123,
    healthCheck: { port: 8123 },
    dataPath: "/var/lib/clickhouse",
    // The HTTP interface and its /play page share port 8123.
    uiPorts: [8123],
    params: { CLICKHOUSE_DB: "app", CLICKHOUSE_USER: "default", CLICKHOUSE_PASSWORD: "flisk" },
    provides: {
      CLICKHOUSE_URL: "http://{name}:8123",
      CLICKHOUSE_USER: "default",
      CLICKHOUSE_PASSWORD: "flisk",
      CLICKHOUSE_DB: "app",
    },
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
  mailpit: {
    type: MAIL_RESOURCE_TYPE,
    description: "Mailpit SMTP server and inbox (stands in for Resend, SendGrid, Postmark, SES)",
    image: "axllent/mailpit:v1.33.1",
    port: 1025,
    healthCheck: { port: 1025 },
    dataPath: "/data",
    // Keep the inbox in the data volume, so a restart does not empty it.
    params: { MP_DATABASE: "/data/mailpit.db" },
    // The inbox UI and its REST API (/api/v1/messages) share port 8025.
    uiPorts: [8025],
    provides: {
      SMTP_URL: "smtp://{name}:1025",
      SMTP_HOST: "{name}",
      SMTP_PORT: "1025",
      MAILPIT_API_URL: "http://{name}:8025",
    },
  },
  "stripe-mock": {
    type: PAYMENTS_RESOURCE_TYPE,
    description:
      "stripe-mock Stripe API emulator (stateless: answers every call from the OpenAPI spec)",
    image: "stripe/stripe-mock:v0.206.0",
    port: 12111,
    healthCheck: { port: 12111 },
    // stripe-mock accepts a key of sk_test_ and letters or digits (an underscore after the prefix is a 401); this one is not
    // a secret and reaches no real account.
    provides: {
      STRIPE_API_BASE: "http://{name}:12111",
      STRIPE_SECRET_KEY: "sk_test_flisklocal",
    },
  },
} as const satisfies Record<InfraFramework, InfraPreset>;

/** Types that used to be presets (1.4.24) and now are a framework of `database`, `queue` or `storage`. */
const REMOVED_PRESET_TYPES: Record<string, InfraFramework> = {
  redis: "redis",
  qdrant: "qdrant",
  rabbitmq: "rabbitmq",
  minio: "minio",
  mlflow: "mlflow",
};

/** The `--type ... --framework ...` that replaces a removed preset type, or undefined when `type` was never one. */
export function replacementForRemovedType(type: string): string | undefined {
  const framework = REMOVED_PRESET_TYPES[type];
  return framework ? `--type ${INFRA_PRESETS[framework].type} --framework ${framework}` : undefined;
}

export function isInfraFramework(value: unknown): value is InfraFramework {
  return typeof value === "string" && Object.hasOwn(INFRA_PRESETS, value);
}

/**
 * The preset `--type database|queue|storage` with `--framework` selects, or undefined for the shared Postgres (`--type
 * database` with no framework or `postgres`). A preset type without `--framework` runs its default (a queue is NATS, storage
 * is MinIO). Throws nothing: assertInfraFramework reports a wrong combination.
 */
export function infraFrameworkFor(
  type: string,
  framework: string | undefined,
): InfraFramework | undefined {
  if (isPresetResourceType(type)) {
    return (framework ?? PRESET_RESOURCE_TYPES[type].default) as InfraFramework;
  }
  return type === DATABASE_RESOURCE_TYPE && isInfraFramework(framework) ? framework : undefined;
}

/** True for a `--type` whose every framework is a preset container (`queue`, `storage`). */
export function isPresetResourceType(type: string): type is PresetResourceType {
  return Object.hasOwn(PRESET_RESOURCE_TYPES, type);
}

/** True for a `--type` that offers infrastructure frameworks: `database` and the preset types. */
export function isInfraResourceType(type: string): type is InfraResourceType {
  return type === DATABASE_RESOURCE_TYPE || isPresetResourceType(type);
}

/** The frameworks `type` accepts, in the order the help lists them. */
export function frameworksOfType(type: string): readonly string[] {
  return isPresetResourceType(type)
    ? PRESET_RESOURCE_TYPES[type].frameworks
    : DATABASE_INFRA_FRAMEWORKS;
}

/** The framework a preset type runs when `--framework` is left out; undefined for `database` (the shared Postgres). */
export function defaultFrameworkOfType(type: string): string | undefined {
  return isPresetResourceType(type) ? PRESET_RESOURCE_TYPES[type].default : undefined;
}

/** The service.json of an infrastructure preset. `image` replaces the pinned image (for example redis:8-alpine). */
export function createInfraServiceJson(
  name: string,
  stack: string,
  framework: InfraFramework,
  image?: string,
): Record<string, unknown> {
  const preset: InfraPreset = INFRA_PRESETS[framework];
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
    ...(preset.dataPath ? { volumes: [{ source: `${name}-data`, target: preset.dataPath }] } : {}),
    ...(preset.params ? { params: { ...preset.params } } : {}),
    provides: Object.fromEntries(
      Object.entries(preset.provides).map(([key, value]) => [key, value.replace("{name}", name)]),
    ),
  };
}
