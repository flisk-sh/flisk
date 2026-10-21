// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * True for a resource that runs as an HTTP API service behind the Traefik API host: a backend, or an `mcp` server (a Model Context
 * Protocol endpoint, which the engine builds, routes and health-checks exactly like a backend).
 */
export function isApiServiceType(appType) {
    return appType === "backend" || appType === "mcp" || appType === "agent";
}
