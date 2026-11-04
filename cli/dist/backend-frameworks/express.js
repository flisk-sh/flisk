// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { portFromEnv } from "../utils/generated-port.js";
export function getExpressIndexTemplate(name) {
    return `import express from 'express';

const app = express();

// Health check endpoint (required by TILT_RESOURCE_DEFAULTS.star)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: '${name}' });
});

app.get('/health/live', (_req, res) => {
  res.json({ status: 'alive', timestamp: Date.now() });
});

app.get('/health/ready', async (_req, res) => {
  const dependencies: Record<string, string> = {};
  let allReady = true;

  // Add dependency checks here (database, cache, etc.)
  // Mark allReady = false if any dependency is unhealthy

  const status = allReady ? 'ready' : 'not_ready';
  res.status(allReady ? 200 : 503).json({ status, dependencies });
});

app.get('/', (_req, res) => {
  res.json({
    service: '${name}',
    version: '1.0.0',
    endpoints: ['/health', '/health/live', '/health/ready']
  });
});

${portFromEnv()}

// Bind beyond loopback: Traefik reaches the container over the Docker network.
app.listen(port, '0.0.0.0', () => {
  console.log('\\n🚀 ${name} running on http://localhost:' + port);
  console.log('📊 Health check: http://localhost:' + port + '/health\\n');
});
`;
}
export const expressBackendProvider = {
    id: "express",
    label: "Bun + Express",
    dependencies: { express: "^5.1.0" },
    devDependencies: { "@types/express": "^5.0.0" },
    createIndex: getExpressIndexTemplate,
};
