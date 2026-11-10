// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { LOCAL_FRONTEND_CORS_REASON, localFrontendOriginConst } from "../utils/generated-cors.js";
import { portFromEnv } from "../utils/generated-port.js";
import type { BackendFrameworkProvider } from "./types.js";

export function getKoaIndexTemplate(name: string) {
  return `import Koa from 'koa';

const app = new Koa();

// ${LOCAL_FRONTEND_CORS_REASON}
${localFrontendOriginConst()}
app.use(async (ctx, next) => {
  const origin = ctx.get('Origin');
  if (LOCAL_FRONTEND_ORIGIN.test(origin)) {
    ctx.vary('Origin');
    ctx.set('Access-Control-Allow-Origin', origin);
    if (ctx.method === 'OPTIONS') {
      ctx.set('Access-Control-Allow-Methods', 'GET, HEAD, PUT, POST, DELETE, PATCH');
      ctx.set('Access-Control-Allow-Headers', ctx.get('Access-Control-Request-Headers'));
      ctx.status = 204;
      return;
    }
  }
  await next();
});

// Plain Koa middleware, so the scaffold needs no router dependency.
app.use(async (ctx) => {
  // Health check: Flisk uses this endpoint to check service health
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

${portFromEnv()}

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
