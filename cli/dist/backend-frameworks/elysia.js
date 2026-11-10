// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { LOCAL_FRONTEND_CORS_REASON, localFrontendOriginConst } from "../utils/generated-cors.js";
import { portFromEnv } from "../utils/generated-port.js";
export function getElysiaIndexTemplate(name) {
    return `import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';

${portFromEnv()}

// ${LOCAL_FRONTEND_CORS_REASON}
${localFrontendOriginConst()}

const app = new Elysia()
  .use(cors({ origin: LOCAL_FRONTEND_ORIGIN }))
  // Health check: Flisk uses this endpoint to check service health
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
export const elysiaBackendProvider = {
    id: "elysia",
    label: "Bun + Elysia",
    dependencies: { "@elysiajs/cors": "^1.4.0", elysia: "^1.4.0" },
    devDependencies: {},
    createIndex: getElysiaIndexTemplate,
};
