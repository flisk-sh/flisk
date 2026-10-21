// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { BackendFrameworkProvider } from "./types.js";

export function getFastifyIndexTemplate(name: string) {
  return `import Fastify from 'fastify';

const app = Fastify();

// Health check endpoint (required by TILT_RESOURCE_DEFAULTS.star)
app.get('/health', async () => ({ status: 'ok', service: '${name}' }));

app.get('/health/live', async () => ({ status: 'alive', timestamp: Date.now() }));

app.get('/health/ready', async (_request, reply) => {
  const dependencies: Record<string, string> = {};
  let allReady = true;

  // Add dependency checks here (database, cache, etc.)
  // Mark allReady = false if any dependency is unhealthy

  const status = allReady ? 'ready' : 'not_ready';
  return reply.code(allReady ? 200 : 503).send({ status, dependencies });
});

app.get('/', async () => ({
  service: '${name}',
  version: '1.0.0',
  endpoints: ['/health', '/health/live', '/health/ready']
}));

const port = Number(process.env.PORT || 3000);

// Bind beyond loopback: Traefik reaches the container over the Docker network.
await app.listen({ port, host: '0.0.0.0' });

console.log('\\n🚀 ${name} running on http://localhost:' + port);
console.log('📊 Health check: http://localhost:' + port + '/health\\n');
`;
}

export const fastifyBackendProvider: BackendFrameworkProvider = {
  id: "fastify",
  label: "Bun + Fastify",
  dependencies: { fastify: "^5.0.0" },
  devDependencies: {},
  createIndex: getFastifyIndexTemplate,
};
