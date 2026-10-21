export const vueFrontendProvider = {
    id: "vue",
    label: "Vue + Vite",
    dependencies: {
        vue: "^3.5.0",
    },
    devDependencies: {
        "@vitejs/plugin-vue": "^5.2.4",
    },
    compilerOptions: {},
    createFiles(name) {
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
                content: `<script setup lang="ts">
const message = 'Frontend resource created with Flisk';
</script>

<template>
  <main style="padding: 2rem; font-family: system-ui">
    <h1>${name}</h1>
    <p>{{ message }}</p>
  </main>
</template>
`,
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
