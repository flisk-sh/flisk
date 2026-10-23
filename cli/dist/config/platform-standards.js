// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { PORT_RANGES, STANDARD_PORTS } from "../utils/constants.js";
const PLATFORM_VERSION = "1.0.0";
const TECH_STACK = {
    runtime: "bun",
    bundler: "vite",
    language: "typescript",
    framework: "hono",
    database: "postgresql",
    orm: "prisma",
    messaging: "nats",
    linting: "biome",
    testing: "vitest",
};
const PORTS = {
    frontend: {
        base: PORT_RANGES.frontend.base,
        range: PORT_RANGES.frontend.range,
        start: PORT_RANGES.frontend.min,
        end: PORT_RANGES.frontend.max,
    },
    backend: {
        base: PORT_RANGES.backend.base,
        range: PORT_RANGES.backend.range,
        start: PORT_RANGES.backend.min,
        end: PORT_RANGES.backend.max,
    },
    health: {
        base: PORT_RANGES.health.base,
        range: PORT_RANGES.health.range,
        start: PORT_RANGES.health.min,
        end: PORT_RANGES.health.max,
    },
    worker: {
        base: PORT_RANGES.worker.base,
        range: PORT_RANGES.worker.range,
        start: PORT_RANGES.worker.min,
        end: PORT_RANGES.worker.max,
    },
    migrator: {
        base: PORT_RANGES.migrator.base,
        range: PORT_RANGES.migrator.range,
        start: PORT_RANGES.migrator.min,
        end: PORT_RANGES.migrator.max,
    },
    tiltUi: STANDARD_PORTS.tiltUi,
    traefik: STANDARD_PORTS.traefik,
};
const HEALTH_CHECKS = {
    path: "/health",
    live: "/health/live",
    ready: "/health/ready",
    timeout: 30,
    interval: 5,
};
const NAMING = {
    frontend: "-frontend",
    backend: "-backend",
    worker: "-worker",
    migrator: "-migrator",
    library: "-lib",
    sdk: "-sdk",
    validSeparators: ["-", "_"],
    maxLength: 63,
    minLength: 3,
};
const TRAEFIK = {
    entrypoint: "web",
    network: "traefik-public",
    defaultHost: "localhost",
    appHost: "app.localhost",
    apiHost: "api.localhost",
    appSubdomainPrefix: "app",
    apiSubdomainPrefix: "api",
    defaultPort: 8080,
    tlsEnabled: false,
    entrypoints: ["web"],
    middlewares: [],
    tls: { enabled: false },
    healthcheckPath: "/health",
    healthcheckInterval: "10s",
    healthcheckTimeout: "5s",
    frontendPriorityBase: 100,
};
const FILEWATCH_IGNORES = [
    "node_modules",
    "dist",
    "build",
    ".git",
    ".prisma",
    ".turbo",
    "coverage",
    "tmp",
    "temp",
    "__tests__",
    "test",
    "tests",
];
const RESOURCE_TYPES = {
    frontend: {
        suffix: "-frontend",
        portRange: "3000-3999",
    },
    backend: {
        suffix: "-backend",
        portRange: "4000-4999",
    },
    library: {
        suffix: "-library",
        portRange: null,
    },
    sdk: {
        suffix: "-sdk",
        portRange: "3000-9999",
    },
    migrator: {
        suffix: "-migrator",
        portRange: "7000-7999",
    },
    worker: {
        suffix: "-worker",
        portRange: "6000-6999",
    },
};
const FEATURES = {
    prisma: "Database ORM with migrations",
    nats: "Event streaming via NATS",
    redis: "Caching layer",
    infisical: "Secrets management",
    vitest: "Testing framework",
    traefik: "HTTP routing",
    websocket: "Real-time connections",
    graphql: "GraphQL support",
    grpc: "gRPC support",
    viteNode: "Vite Node runtime",
    maintenance: "Maintenance mode",
};
const PATHS = {
    services: "services/product",
    sharedPlatform: "shared-platform-engineering",
    sharedProduct: "shared-product-engineering",
    sharedDdd: "shared-ddd-layers",
};
const DISCOVERY = {
    scanIntervalSeconds: 5,
    maxManifestsPerRoot: 50,
    servicePatterns: ["services/product/*", "services/platform/*"],
};
const DOCKER = {
    dockerfile: "Dockerfile",
    context: ".",
    // Auto-detect native arch (arm64 on Apple Silicon, amd64 elsewhere)
    // platform: "linux/amd64",
};
const RUNTIME = {
    backend: {
        command: "bun",
        args: ["run", "dev"],
        env: { NODE_ENV: "development" },
    },
    frontend: {
        command: "bun",
        args: ["run", "dev"],
        env: { NODE_ENV: "development" },
    },
};
export const PLATFORM_STANDARDS = {
    version: PLATFORM_VERSION,
    tech: TECH_STACK,
    ports: PORTS,
    health: HEALTH_CHECKS,
    naming: NAMING,
    traefik: TRAEFIK,
    filewatchIgnores: FILEWATCH_IGNORES,
    serviceTypes: RESOURCE_TYPES,
    features: FEATURES,
    paths: PATHS,
    discovery: DISCOVERY,
    docker: DOCKER,
    runtime: RUNTIME,
};
