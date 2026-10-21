// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { BackendFrameworkProvider } from "./types.js";

export function getElysiaIndexTemplate(name: string) {
  return `import { Elysia } from 'elysia';

const port = Number(process.env.PORT || 3000);

const app = new Elysia()
  // Health check endpoint (required by TILT_RESOURCE_DEFAULTS.star)
  .get('/health', () => ({ status: 'ok', service: '${name}' }))
  .get('/health/live', () => ({ status: 'alive', timestamp: Date.now() }))
  .get('/health/ready', ({ set }) => {
    const dependencies: Record<string, string> = {};
    let allReady = true;

    // Add dependency checks here (database, cache, etc.)
    // Mark allReady = false if any dependency is unhealthy

    set.status = allReady ? 200 : 503;
    return { status: allReady ? 'ready' : 'not_ready', dependencies };
  })
  .get('/', () => ({
    service: '${name}',
    version: '1.0.0',
    endpoints: ['/health', '/health/live', '/health/ready']
  }))
  // Bind beyond loopback: Traefik reaches the container over the Docker network.
  .listen({ port, hostname: '0.0.0.0' });

console.log('\\n🚀 ${name} running on http://localhost:' + app.server?.port);
console.log('📊 Health check: http://localhost:' + app.server?.port + '/health\\n');
`;
}

export const elysiaBackendProvider: BackendFrameworkProvider = {
  id: "elysia",
  label: "Bun + Elysia",
  dependencies: { elysia: "^1.3.0" },
  devDependencies: {},
  createIndex: getElysiaIndexTemplate,
};
