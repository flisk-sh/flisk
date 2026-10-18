// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import type { BackendLanguageProvider } from "./types.js";

export function getBackendIndexTemplate(name: string) {
  return renderBackendIndex(name, false);
}

/** The Bun + Hono backend with a `/health/db` route that runs a query through the Drizzle client. */
export function getDrizzleBackendIndexTemplate(name: string) {
  return renderBackendIndex(name, true);
}

function renderBackendIndex(name: string, drizzle: boolean) {
  const drizzleImports = drizzle
    ? "import { sql } from 'drizzle-orm';\nimport { db } from './db.js';\n"
    : "";
  const drizzleRoute = drizzle
    ? `// Database check: runs a trivial query through the Drizzle client (src/db.ts).
app.get('/health/db', async (c) => {
  try {
    await db.execute(sql\`select 1\`);
    return c.json({ status: 'ok', database: 'up' });
  } catch (error) {
    console.error('Database health check failed:', error);
    return c.json({ status: 'error', database: 'down' }, 503);
  }
});

`
    : "";
  return `import { Hono } from 'hono';
${drizzleImports}
const app = new Hono();

// Health check endpoint (required by TILT_RESOURCE_DEFAULTS.star)
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: '${name}' });
});

app.get('/health/live', (c) => {
  return c.json({ status: 'alive', timestamp: Date.now() });
});

app.get('/health/ready', async (c) => {
  const dependencies: Record<string, string> = {};
  let allReady = true;

  // Add dependency checks here (database, cache, etc.)
  // Mark allReady = false if any dependency is unhealthy

  const status = allReady ? 'ready' : 'not_ready';
  return c.json({ status, dependencies }, allReady ? 200 : 503);
});

${drizzleRoute}app.get('/', (c) => {
  return c.json({
    service: '${name}',
    version: '1.0.0',
    endpoints: ['/health', '/health/live', '/health/ready'${drizzle ? ", '/health/db'" : ""}]
  });
});

const port = process.env.PORT || 3000;
console.log('\\n🚀 ${name} running on http://localhost:' + port);
console.log('📊 Health check: http://localhost:' + port + '/health\\n');

export default {
  port,
  fetch: app.fetch,
};
`;
}

/**
 * The historical default. Package scripts, tsconfig, Dockerfile, and the vitest smoke test stay in
 * the shared scaffold so omitted-language output is byte-identical to before providers existed.
 */
export const bunBackendProvider: BackendLanguageProvider = {
  id: "bun",
  label: "Bun + Hono",
  installHint: "bun install",
};
