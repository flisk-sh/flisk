// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { BackendFrameworkProvider } from "./types.js";

export function getKoaIndexTemplate(name: string) {
  return `import Koa from 'koa';

const app = new Koa();

// Plain Koa middleware, so the scaffold needs no router dependency.
app.use(async (ctx) => {
  // Health check endpoint (required by TILT_RESOURCE_DEFAULTS.star)
  if (ctx.path === '/health') {
    ctx.body = { status: 'ok', service: '${name}' };
    return;
  }

  if (ctx.path === '/health/live') {
    ctx.body = { status: 'alive', timestamp: Date.now() };
    return;
  }

  if (ctx.path === '/') {
    ctx.body = {
      service: '${name}',
      version: '1.0.0',
      endpoints: ['/health', '/health/live']
    };
    return;
  }

  ctx.status = 404;
  ctx.body = { error: 'not_found' };
});

const port = Number(process.env.PORT || 3000);

// Bind beyond loopback: Traefik reaches the container over the Docker network.
app.listen(port, '0.0.0.0', () => {
  console.log('\\n🚀 ${name} running on http://localhost:' + port);
  console.log('📊 Health check: http://localhost:' + port + '/health\\n');
});
`;
}

export const koaBackendProvider: BackendFrameworkProvider = {
  id: "koa",
  label: "Bun + Koa",
  dependencies: { koa: "^3.0.0" },
  devDependencies: { "@types/koa": "^3.0.0" },
  createIndex: getKoaIndexTemplate,
};
