export declare const PLATFORM_STANDARDS: {
    readonly version: "1.0.0";
    readonly tech: {
        readonly runtime: "bun";
        readonly bundler: "vite";
        readonly language: "typescript";
        readonly framework: "hono";
        readonly database: "postgresql";
        readonly orm: "prisma";
        readonly messaging: "nats";
        readonly linting: "biome";
        readonly testing: "vitest";
    };
    readonly ports: {
        readonly frontend: {
            readonly base: 3000;
            readonly range: "3000-3999";
            readonly start: 3000;
            readonly end: 3999;
        };
        readonly backend: {
            readonly base: 4000;
            readonly range: "4000-4999";
            readonly start: 4000;
            readonly end: 4999;
        };
        readonly health: {
            readonly base: 5000;
            readonly range: "5000-5999";
            readonly start: 5000;
            readonly end: 5999;
        };
        readonly worker: {
            readonly base: 6000;
            readonly range: "6000-6999";
            readonly start: 6000;
            readonly end: 6999;
        };
        readonly migrator: {
            readonly base: 7000;
            readonly range: "7000-7999";
            readonly start: 7000;
            readonly end: 7999;
        };
        readonly tiltUi: 10350;
        readonly traefik: 8080;
    };
    readonly health: {
        readonly path: "/health";
        readonly live: "/health/live";
        readonly ready: "/health/ready";
        readonly timeout: 30;
        readonly interval: 5;
    };
    readonly naming: {
        readonly frontend: "-frontend";
        readonly backend: "-backend";
        readonly worker: "-worker";
        readonly migrator: "-migrator";
        readonly library: "-lib";
        readonly sdk: "-sdk";
        readonly validSeparators: readonly ["-", "_"];
        readonly maxLength: 63;
        readonly minLength: 3;
    };
    readonly traefik: {
        readonly entrypoint: "web";
        readonly network: "traefik-public";
        readonly defaultHost: "localhost";
        readonly appHost: "app.localhost";
        readonly apiHost: "api.localhost";
        readonly appSubdomainPrefix: "app";
        readonly apiSubdomainPrefix: "api";
        readonly defaultPort: 8080;
        readonly tlsEnabled: false;
        readonly entrypoints: readonly ["web"];
        readonly middlewares: readonly [];
        readonly tls: {
            readonly enabled: false;
        };
        readonly healthcheckPath: "/health";
        readonly healthcheckInterval: "10s";
        readonly healthcheckTimeout: "5s";
        readonly frontendPriorityBase: 100;
    };
    readonly filewatchIgnores: readonly ["node_modules", "dist", "build", ".git", ".prisma", ".turbo", "coverage", "tmp", "temp", "__tests__", "test", "tests"];
    readonly serviceTypes: {
        readonly frontend: {
            readonly suffix: "-frontend";
            readonly portRange: "3000-3999";
        };
        readonly backend: {
            readonly suffix: "-backend";
            readonly portRange: "4000-4999";
        };
        readonly library: {
            readonly suffix: "-library";
            readonly portRange: null;
        };
        readonly sdk: {
            readonly suffix: "-sdk";
            readonly portRange: "3000-9999";
        };
        readonly migrator: {
            readonly suffix: "-migrator";
            readonly portRange: "7000-7999";
        };
        readonly worker: {
            readonly suffix: "-worker";
            readonly portRange: "6000-6999";
        };
    };
    readonly features: {
        readonly prisma: "Database ORM with migrations";
        readonly nats: "Event streaming via NATS";
        readonly redis: "Caching layer";
        readonly infisical: "Secrets management";
        readonly vitest: "Testing framework";
        readonly traefik: "HTTP routing";
        readonly websocket: "Real-time connections";
        readonly graphql: "GraphQL support";
        readonly grpc: "gRPC support";
        readonly viteNode: "Vite Node runtime";
        readonly maintenance: "Maintenance mode";
    };
    readonly paths: {
        readonly services: "services/product";
        readonly sharedPlatform: "shared-platform-engineering";
        readonly sharedProduct: "shared-product-engineering";
        readonly sharedDdd: "shared-ddd-layers";
    };
    readonly discovery: {
        readonly scanIntervalSeconds: 5;
        readonly maxManifestsPerRoot: 50;
        readonly servicePatterns: readonly ["services/product/*", "services/platform/*"];
    };
    readonly docker: {
        readonly dockerfile: "Dockerfile";
        readonly context: ".";
    };
    readonly runtime: {
        readonly backend: {
            readonly command: "bun";
            readonly args: readonly ["run", "dev"];
            readonly env: {
                readonly NODE_ENV: "development";
            };
        };
        readonly frontend: {
            readonly command: "bun";
            readonly args: readonly ["run", "dev"];
            readonly env: {
                readonly NODE_ENV: "development";
            };
        };
    };
};
export type PlatformStandards = typeof PLATFORM_STANDARDS;
