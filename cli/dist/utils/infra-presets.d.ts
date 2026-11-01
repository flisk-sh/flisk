import { DATABASE_RESOURCE_TYPE, type InfraFramework, QUEUE_RESOURCE_TYPE } from "../types/index.js";
/**
 * Infrastructure frameworks: `flisk resource <name> --type database --framework redis|qdrant|minio|mlflow` and
 * `--type queue --framework nats|rabbitmq` (the shared Postgres is `--type database` on its own). Each is a pinned image
 * with a readiness probe, a named data volume that `flisk down` keeps, and `provides`: the connection settings every
 * service that lists it in `dependsOn` gets in its environment. Services in the stack reach it on the Docker network by
 * name. A framework with a web UI also publishes it on 127.0.0.1 only (`extraPorts`); two resources of one framework
 * collide on that host port, so change `hostPort` in one service.json. The service.json is a plain bring-your-own one
 * with `framework` recorded: the engine does not know these frameworks.
 */
export interface InfraPreset {
    /** The resource type that offers it. */
    type: typeof DATABASE_RESOURCE_TYPE | typeof QUEUE_RESOURCE_TYPE;
    /** What it is, for `flisk resource --help` and the created message. */
    description: string;
    image: string;
    /** The port the image listens on inside the container. */
    port: number;
    /** service.json `healthCheck`: a TCP port or a command, since none of these serves the Flisk health route. */
    healthCheck: {
        port: number;
    } | {
        command: string[];
    };
    /** Where the image keeps its data; mounted from the named volume `<name>-data`. */
    dataPath: string;
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
export declare const INFRA_PRESETS: {
    readonly redis: {
        readonly type: "database";
        readonly description: "Redis cache and job queue";
        readonly image: "redis:7.4-alpine";
        readonly port: 6379;
        readonly healthCheck: {
            readonly command: ["redis-cli", "ping"];
        };
        readonly dataPath: "/data";
        readonly provides: {
            readonly REDIS_URL: "redis://{name}:6379";
        };
    };
    readonly qdrant: {
        readonly type: "database";
        readonly description: "Qdrant vector database";
        readonly image: "qdrant/qdrant:v1.12.5";
        readonly port: 6333;
        readonly healthCheck: {
            readonly port: 6333;
        };
        readonly dataPath: "/qdrant/storage";
        readonly uiPorts: [6333];
        readonly provides: {
            readonly QDRANT_URL: "http://{name}:6333";
        };
    };
    readonly minio: {
        readonly type: "database";
        readonly description: "MinIO S3-compatible object storage";
        readonly image: "pgsty/minio:RELEASE.2026-08-04T00-00-00Z";
        readonly port: 9000;
        readonly healthCheck: {
            readonly port: 9000;
        };
        readonly dataPath: "/data";
        readonly command: ["server", "/data", "--console-address", ":9001"];
        readonly uiPorts: [9001];
        readonly params: {
            readonly MINIO_ROOT_USER: "minioadmin";
            readonly MINIO_ROOT_PASSWORD: "minioadmin";
        };
        readonly provides: {
            readonly MINIO_ENDPOINT: "http://{name}:9000";
            readonly AWS_ENDPOINT_URL_S3: "http://{name}:9000";
            readonly AWS_ACCESS_KEY_ID: "minioadmin";
            readonly AWS_SECRET_ACCESS_KEY: "minioadmin";
        };
    };
    readonly mlflow: {
        readonly type: "database";
        readonly description: "MLflow tracking server";
        readonly image: "ghcr.io/mlflow/mlflow:v3.17.2";
        readonly port: 5000;
        readonly healthCheck: {
            readonly port: 5000;
        };
        readonly dataPath: "/data";
        readonly command: ["sh", "-c", string];
        readonly memory: "3g";
        readonly uiPorts: [5000];
        readonly provides: {
            readonly MLFLOW_TRACKING_URI: "http://{name}:5000";
        };
    };
    readonly nats: {
        readonly type: "queue";
        readonly description: "NATS message queue with JetStream";
        readonly image: "nats:2.11.8-alpine";
        readonly port: 4222;
        readonly healthCheck: {
            readonly port: 4222;
        };
        readonly dataPath: "/data";
        readonly command: ["-js", "-sd", "/data", "-m", "8222"];
        readonly provides: {
            readonly NATS_URL: "nats://{name}:4222";
        };
    };
    readonly rabbitmq: {
        readonly type: "queue";
        readonly description: "RabbitMQ message broker";
        readonly image: "rabbitmq:4.1-management-alpine";
        readonly port: 5672;
        readonly healthCheck: {
            readonly command: ["rabbitmq-diagnostics", "-q", "ping"];
        };
        readonly dataPath: "/var/lib/rabbitmq";
        readonly uiPorts: [15672];
        readonly params: {
            readonly RABBITMQ_NODENAME: "rabbit@localhost";
            readonly RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS: "-rabbit loopback_users []";
        };
        readonly provides: {
            readonly AMQP_URL: "amqp://guest:guest@{name}:5672";
        };
    };
};
/** The `--type ... --framework ...` that replaces a removed preset type, or undefined when `type` was never one. */
export declare function replacementForRemovedType(type: string): string | undefined;
export declare function isInfraFramework(value: unknown): value is InfraFramework;
/**
 * The preset `--type database|queue` with `--framework` selects, or undefined for the shared Postgres (`--type database`
 * with no framework or `postgres`). A queue without `--framework` is NATS. Throws nothing: assertInfraFramework reports a
 * wrong combination.
 */
export declare function infraFrameworkFor(type: string, framework: string | undefined): InfraFramework | undefined;
/** The frameworks `type` accepts, in the order the help lists them. */
export declare function frameworksOfType(type: string): readonly string[];
/** The service.json of an infrastructure preset. `image` replaces the pinned image (for example redis:8-alpine). */
export declare function createInfraServiceJson(name: string, stack: string, framework: InfraFramework, image?: string): Record<string, unknown>;
