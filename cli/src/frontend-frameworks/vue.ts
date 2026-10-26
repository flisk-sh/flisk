// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { FrontendFrameworkOptions, FrontendFrameworkProvider } from "./types.js";

const STARTER_STYLE = `<style scoped>
main { max-width: 640px; margin: 0 auto; padding: 3rem 1.5rem; font-family: system-ui, sans-serif; color: #1f2933; }
.muted { color: #616e7c; margin-top: 0; }
.card { border: 1px solid #d9e2ec; border-radius: 8px; padding: 1rem 1.25rem; margin: 1.5rem 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.ok { color: #0a7f3f; }
.unreachable { color: #b42318; }
pre { background: #f5f7fa; border-radius: 6px; padding: 0.75rem; overflow-x: auto; }
</style>`;

/** Hints and links shared by both starters. They need no backend, so they appear in every frontend. */
const STARTER_HINTS = `    <p>Edit <code>src/App.vue</code> and save. It live-reloads.</p>
    <ul>
      <li><a href="http://localhost:10350">Tilt UI</a>: logs and resource status</li>
      <li><code>flisk status</code>: every resource in this project</li>
    </ul>`;

function renderAppWithBackend(name: string, backendName: string): string {
  return `<script setup lang="ts">
import { onMounted, ref } from 'vue';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const BACKEND_NAME = '${backendName}';

interface Health {
  ok: boolean;
  body: unknown;
}

const health = ref<Health | null>(null);

onMounted(async () => {
  try {
    const response = await fetch(API_URL + '/health');
    health.value = { ok: response.ok, body: await response.json() };
  } catch (error) {
    health.value = { ok: false, body: { error: String(error) } };
  }
});
</script>

<template>
  <main>
    <h1>${name}</h1>
    <p class="muted">Flisk frontend</p>

    <section class="card">
      <div class="card-header">
        <strong>Backend: {{ BACKEND_NAME }}</strong>
        <span v-if="health === null">checking…</span>
        <span v-else-if="health.ok" class="ok">ok</span>
        <span v-else class="unreachable">unreachable</span>
      </div>
      <pre v-if="health">{{ JSON.stringify(health.body, null, 2) }}</pre>
    </section>

${STARTER_HINTS}
  </main>
</template>

${STARTER_STYLE}
`;
}

function renderAppWithoutBackend(name: string): string {
  return `<script setup lang="ts">
const appName = '${name}';
</script>

<template>
  <main>
    <h1>{{ appName }}</h1>
    <p class="muted">Flisk frontend</p>

${STARTER_HINTS}
  </main>
</template>

${STARTER_STYLE}
`;
}

export const vueFrontendProvider: FrontendFrameworkProvider = {
  id: "vue",
  label: "Vue + Vite",
  dependencies: {
    vue: "^3.5.0",
  },
  devDependencies: {
    "@vitejs/plugin-vue": "^5.2.4",
  },
  compilerOptions: {},
  createFiles(name, options: FrontendFrameworkOptions = {}) {
    return [
      {
        filename: "index.html",
        content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
        description: "Generating HTML template",
        emoji: "💻",
      },
      {
        filename: "src/main.ts",
        content: `import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');
`,
        description: "Generating Vue entry",
        emoji: "💻",
      },
      {
        filename: "src/App.vue",
        content: options.backendName
          ? renderAppWithBackend(name, options.backendName)
          : renderAppWithoutBackend(name),
        description: "Generating Vue app",
        emoji: "💻",
      },
      {
        filename: "src/vite-env.d.ts",
        content: `/// <reference types="vite/client" />

declare module '*.vue' {
  import type { Component } from 'vue';
  const component: Component;
  export default component;
}
`,
        description: "Generating Vue module types",
        emoji: "⚙️",
      },
    ];
  },
};
