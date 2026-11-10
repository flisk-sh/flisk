// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { LOCAL_FRONTEND_CORS_REASON, localFrontendOriginConst } from "../utils/generated-cors.js";
import { portFromEnv } from "../utils/generated-port.js";
import type { BackendFrameworkProvider } from "./types.js";

export function getExpressIndexTemplate(name: string) {
  return `import express from 'express';

const app = express();

// ${LOCAL_FRONTEND_CORS_REASON}
${localFrontendOriginConst()}
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && LOCAL_FRONTEND_ORIGIN.test(origin)) {
    res.vary('Origin');
    res.set('Access-Control-Allow-Origin', origin);
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, HEAD, PUT, POST, DELETE, PATCH');
      res.set('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] ?? '');
      res.sendStatus(204);
      return;
    }
  }
  next();
});

// Health check: Flisk uses this endpoint to check service health
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

export const expressBackendProvider: BackendFrameworkProvider = {
  id: "express",
  label: "Bun + Express",
  dependencies: { express: "^5.1.0" },
  devDependencies: { "@types/express": "^5.0.0" },
  createIndex: getExpressIndexTemplate,
};
