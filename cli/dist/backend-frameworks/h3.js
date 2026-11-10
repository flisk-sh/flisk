// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { LOCAL_FRONTEND_CORS_REASON, localFrontendOriginConst } from "../utils/generated-cors.js";
import { portFromEnv } from "../utils/generated-port.js";
export function getH3IndexTemplate(name) {
    return `import { createServer } from 'node:http';
import { createApp, createRouter, defineEventHandler, handleCors, toNodeListener } from 'h3';

const app = createApp();
const router = createRouter();

// ${LOCAL_FRONTEND_CORS_REASON}
${localFrontendOriginConst()}
app.use(defineEventHandler((event) => {
  if (handleCors(event, { origin: [LOCAL_FRONTEND_ORIGIN], methods: '*', preflight: { statusCode: 204 } })) {
    return null;
  }
}));

// Health check: Flisk uses this endpoint to check service health
router.get('/health', defineEventHandler(() => ({ status: 'ok', service: '${name}' })));

router.get('/health/live', defineEventHandler(() => ({ status: 'alive', timestamp: Date.now() })));

router.get('/', defineEventHandler(() => ({
  service: '${name}',
  version: '1.0.0',
  endpoints: ['/health', '/health/live']
})));

app.use(router);

${portFromEnv()}

// node:http works on Bun. Bind beyond loopback: Traefik reaches the container over the Docker network.
createServer(toNodeListener(app)).listen(port, '0.0.0.0', () => {
  console.log('\\n🚀 ${name} running on http://localhost:' + port);
  console.log('📊 Health check: http://localhost:' + port + '/health\\n');
});
`;
}
export const h3BackendProvider = {
    id: "h3",
    label: "Bun + h3",
    // h3's npm "latest" tag is a 2.0 release candidate; the scaffold stays on the stable 1.x line.
    dependencies: { h3: "^1.15.0" },
    devDependencies: {},
    createIndex: getH3IndexTemplate,
};
