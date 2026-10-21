// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { BackendFrameworkProvider } from "./types.js";

export function getH3IndexTemplate(name: string) {
  return `import { createServer } from 'node:http';
import { createApp, createRouter, defineEventHandler, toNodeListener } from 'h3';

const app = createApp();
const router = createRouter();

// Health check endpoint (required by TILT_RESOURCE_DEFAULTS.star)
router.get('/health', defineEventHandler(() => ({ status: 'ok', service: '${name}' })));

router.get('/health/live', defineEventHandler(() => ({ status: 'alive', timestamp: Date.now() })));

router.get('/', defineEventHandler(() => ({
  service: '${name}',
  version: '1.0.0',
  endpoints: ['/health', '/health/live']
})));

app.use(router);

const port = Number(process.env.PORT || 3000);

// node:http works on Bun. Bind beyond loopback: Traefik reaches the container over the Docker network.
createServer(toNodeListener(app)).listen(port, '0.0.0.0', () => {
  console.log('\\n🚀 ${name} running on http://localhost:' + port);
  console.log('📊 Health check: http://localhost:' + port + '/health\\n');
});
`;
}

export const h3BackendProvider: BackendFrameworkProvider = {
  id: "h3",
  label: "Bun + h3",
  // h3's npm "latest" tag is a 2.0 release candidate; the scaffold stays on the stable 1.x line.
  dependencies: { h3: "^1.15.0" },
  devDependencies: {},
  createIndex: getH3IndexTemplate,
};
