// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { FrontendFrameworkProvider } from "./types.js";

export const svelteFrontendProvider: FrontendFrameworkProvider = {
  id: "svelte",
  label: "Svelte + Vite",
  dependencies: {
    svelte: "^5.0.0",
  },
  devDependencies: {
    "@sveltejs/vite-plugin-svelte": "^5.0.0",
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
        content: `import { mount } from 'svelte';
import App from './App.svelte';

const app = mount(App, { target: document.getElementById('app')! });

export default app;
`,
        description: "Generating Svelte entry",
        emoji: "💻",
      },
      {
        filename: "src/App.svelte",
        content: `<script lang="ts">
  const message: string = 'Frontend resource created with Flisk';
</script>

<main style="padding: 2rem; font-family: system-ui">
  <h1>${name}</h1>
  <p>{message}</p>
</main>
`,
        description: "Generating Svelte app",
        emoji: "💻",
      },
      {
        filename: "src/vite-env.d.ts",
        content: `/// <reference types="svelte" />
/// <reference types="vite/client" />
`,
        description: "Generating Svelte module types",
        emoji: "⚙️",
      },
    ];
  },
};
