import { type InfraResourceType } from "../types/index.js";
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
    healthCheck: {
        port: number;
    } | {
        command: string[];
    };
    /** Where the image keeps its data; mounted from the named volume `<name>-data`. */
    dataPath: string;
    /** Non-secret settings for the image itself (service.json `params`). */
    params?: Record<string, string>;
    /** service.json `provides`, with `{name}` replaced by the resource name (its host name on the Docker network). */
    provides: Record<string, string>;
}
export declare const INFRA_PRESETS: {
    readonly redis: {
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
        readonly description: "Qdrant vector database";
        readonly image: "qdrant/qdrant:v1.12.5";
        readonly port: 6333;
        readonly healthCheck: {
            readonly port: 6333;
        };
        readonly dataPath: "/qdrant/storage";
        readonly provides: {
            readonly QDRANT_URL: "http://{name}:6333";
        };
    };
    readonly rabbitmq: {
        readonly description: "RabbitMQ message broker";
        readonly image: "rabbitmq:4.1-management-alpine";
        readonly port: 5672;
        readonly healthCheck: {
            readonly command: ["rabbitmq-diagnostics", "-q", "ping"];
        };
        readonly dataPath: "/var/lib/rabbitmq";
        readonly params: {
            readonly RABBITMQ_NODENAME: "rabbit@localhost";
            readonly RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS: "-rabbit loopback_users []";
        };
        readonly provides: {
            readonly AMQP_URL: "amqp://guest:guest@{name}:5672";
        };
    };
};
export declare function isInfraPreset(value: unknown): value is InfraResourceType;
/** The service.json of an infrastructure preset. `image` replaces the pinned image (for example redis:8-alpine). */
export declare function createInfraServiceJson(name: string, stack: string, presetId: InfraResourceType, image?: string): Record<string, unknown>;
