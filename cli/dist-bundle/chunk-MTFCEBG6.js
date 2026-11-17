import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  SERVICE_MANIFEST_SCHEMA_URL,
  SERVICE_MANIFEST_SCHEMA_VERSION
} from "./chunk-2BH5UW2N.js";
import {
  DATABASE_INFRA_FRAMEWORKS,
  DATABASE_RESOURCE_TYPE,
  MAIL_RESOURCE_TYPE,
  PAYMENT_RESOURCE_TYPE,
  PRESET_RESOURCE_TYPES,
  QUEUE_RESOURCE_TYPE,
  STORAGE_RESOURCE_TYPE
} from "./chunk-U3566SRZ.js";
import {
  FliskError
} from "./chunk-73W4Y4TI.js";

// dist/utils/infra-presets.js
var MINIO_USER = "minioadmin";
var MINIO_PASSWORD = "minioadmin";
var MLFLOW_START_SCRIPT = [
  'if [ -n "$$AWS_ENDPOINT_URL_S3" ]',
  "then pip install -q boto3",
  "n=0",
  `until python3 -c "import boto3; s=boto3.client('s3'); b=[x['Name'] for x in s.list_buckets()['Buckets']]; 'mlflow' in b or s.create_bucket(Bucket='mlflow')"; do n=$$((n+1)); [ $$n -gt 30 ] && exit 1; sleep 2; done`,
  "DEST=s3://mlflow",
  "else DEST=/data/artifacts",
  "fi",
  'exec mlflow server --host 0.0.0.0 --port 5000 --backend-store-uri sqlite:////data/mlflow.db --workers 1 --allowed-hosts "{name}:5000,{name},localhost:*,127.0.0.1:*,10.*,172.*,192.168.*" --serve-artifacts --artifacts-destination "$$DEST"'
].join("; ");
var INFRA_PRESETS = {
  redis: {
    type: DATABASE_RESOURCE_TYPE,
    description: "Redis cache and job queue",
    image: "redis:7.4-alpine",
    port: 6379,
    healthCheck: { command: ["redis-cli", "ping"] },
    dataPath: "/data",
    provides: { REDIS_URL: "redis://{name}:6379" }
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
    provides: { QDRANT_URL: "http://{name}:6333" }
  },
  minio: {
    type: STORAGE_RESOURCE_TYPE,
    description: "MinIO S3-compatible object storage",
    // MinIO stopped publishing images (minio/minio and quay.io/minio/minio). pgsty/minio is a community fork of the last
    // open-source release with the same CLI and S3 API, pinned here; pass --image to use another build.
    image: "pgsty/minio:RELEASE.2026-08-04T00-00-00Z",
    port: 9e3,
    healthCheck: { port: 9e3 },
    dataPath: "/data",
    command: ["server", "/data", "--console-address", ":9001"],
    uiPorts: [9001],
    // Development-only credentials; the S3 port is reachable on the stack's Docker network only.
    params: { MINIO_ROOT_USER: MINIO_USER, MINIO_ROOT_PASSWORD: MINIO_PASSWORD },
    provides: {
      MINIO_ENDPOINT: "http://{name}:9000",
      AWS_ENDPOINT_URL_S3: "http://{name}:9000",
      AWS_ACCESS_KEY_ID: MINIO_USER,
      AWS_SECRET_ACCESS_KEY: MINIO_PASSWORD
    }
  },
  mlflow: {
    type: DATABASE_RESOURCE_TYPE,
    description: "MLflow tracking server",
    image: "ghcr.io/mlflow/mlflow:v3.17.2",
    port: 5e3,
    healthCheck: { port: 5e3 },
    dataPath: "/data",
    command: ["sh", "-c", MLFLOW_START_SCRIPT],
    memory: "3g",
    // The tracking API and the UI share port 5000.
    uiPorts: [5e3],
    provides: { MLFLOW_TRACKING_URI: "http://{name}:5000" }
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
    provides: { MYSQL_URL: "mysql://root:flisk@{name}:3306/app" }
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
    provides: { MONGODB_URL: "mongodb://{name}:27017" }
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
      CLICKHOUSE_DB: "app"
    }
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
    provides: { NATS_URL: "nats://{name}:4222" }
  },
  rabbitmq: {
    type: QUEUE_RESOURCE_TYPE,
    description: "RabbitMQ message broker",
    image: "rabbitmq:4.4-management-alpine",
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
      RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS: "-rabbit loopback_users []"
    },
    provides: { AMQP_URL: "amqp://guest:guest@{name}:5672" }
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
      MAILPIT_API_URL: "http://{name}:8025"
    }
  },
  "stripe-mock": {
    type: PAYMENT_RESOURCE_TYPE,
    description: "stripe-mock Stripe API emulator (stateless: answers every call from the OpenAPI spec)",
    image: "stripe/stripe-mock:v0.206.0",
    port: 12111,
    healthCheck: { port: 12111 },
    // stripe-mock accepts a key of sk_test_ and letters or digits (an underscore after the prefix is a 401); this one is not
    // a secret and reaches no real account.
    provides: {
      STRIPE_API_BASE: "http://{name}:12111",
      STRIPE_SECRET_KEY: "sk_test_flisklocal"
    }
  }
};
var REMOVED_PRESET_TYPES = {
  redis: "redis",
  qdrant: "qdrant",
  rabbitmq: "rabbitmq",
  minio: "minio",
  mlflow: "mlflow"
};
function replacementForRemovedType(type) {
  const framework = REMOVED_PRESET_TYPES[type];
  return framework ? `--type ${INFRA_PRESETS[framework].type} --framework ${framework}` : void 0;
}
function isInfraFramework(value) {
  return typeof value === "string" && Object.hasOwn(INFRA_PRESETS, value);
}
function infraFrameworkFor(type, framework) {
  if (isPresetResourceType(type)) {
    return framework ?? PRESET_RESOURCE_TYPES[type].default;
  }
  return type === DATABASE_RESOURCE_TYPE && isInfraFramework(framework) ? framework : void 0;
}
function isPresetResourceType(type) {
  return Object.hasOwn(PRESET_RESOURCE_TYPES, type);
}
function isInfraResourceType(type) {
  return type === DATABASE_RESOURCE_TYPE || isPresetResourceType(type);
}
function frameworksOfType(type) {
  return isPresetResourceType(type) ? PRESET_RESOURCE_TYPES[type].frameworks : DATABASE_INFRA_FRAMEWORKS;
}
function defaultFrameworkOfType(type) {
  return isPresetResourceType(type) ? PRESET_RESOURCE_TYPES[type].default : void 0;
}
function createInfraServiceJson(name, stack, framework, image) {
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
    ...preset.command || preset.memory ? {
      container: {
        ...preset.command ? { command: preset.command.map((part) => part.replaceAll("{name}", name)) } : {},
        ...preset.memory ? { memory: preset.memory } : {}
      }
    } : {},
    ...preset.uiPorts ? { extraPorts: preset.uiPorts.map((port) => ({ port })) } : {},
    ...preset.dataPath ? { volumes: [{ source: `${name}-data`, target: preset.dataPath }] } : {},
    ...preset.params ? { params: { ...preset.params } } : {},
    provides: Object.fromEntries(Object.entries(preset.provides).map(([key, value]) => [key, value.replace("{name}", name)]))
  };
}

// dist/frontend-frameworks/local.js
function renderLocalViteConfig(provider, options) {
  if (!provider.vite) {
    throw new FliskError(`The ${provider.id} frontend has no Vite setup, so it cannot be written for the host.`, ["Scaffold it without --local to use the Docker and Tilt route."]);
  }
  const imports = ["import { defineConfig } from 'vite';", ...provider.vite.imports];
  const proxy = options.proxyTarget ? `
    proxy: {
      '/health': { target: '${options.proxyTarget}', changeOrigin: true },
      '/api': { target: '${options.proxyTarget}', changeOrigin: true },
    },` : "";
  return `${imports.join("\n")}

// Written by \`flisk resource --local\`: a plain Vite config, so \`npm run dev\` needs no Docker, Tilt or generated files.
export default defineConfig({
  plugins: [${provider.vite.plugins.join(", ")}],
  server: {
    host: 'localhost',
    port: Number(process.env.PORT ?? ${options.port}),
    // Flisk checks and opens this exact port: if it is taken, fail instead of moving to the next one.
    strictPort: true,${proxy}
  },
});
`;
}
var LOCAL_VITE_SCRIPTS = {
  dev: "vite",
  build: "tsc && vite build",
  preview: "vite preview"
};
var LOCAL_FRONTEND_REQUIRES = ["node", "npm"];

export {
  renderLocalViteConfig,
  LOCAL_VITE_SCRIPTS,
  LOCAL_FRONTEND_REQUIRES,
  INFRA_PRESETS,
  replacementForRemovedType,
  isInfraFramework,
  infraFrameworkFor,
  isPresetResourceType,
  isInfraResourceType,
  frameworksOfType,
  defaultFrameworkOfType,
  createInfraServiceJson
};
