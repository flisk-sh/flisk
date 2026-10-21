// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { FrontendFrameworkProvider } from "./types.js";

export const qwikFrontendProvider: FrontendFrameworkProvider = {
  id: "qwik",
  label: "Qwik + Vite",
  dependencies: {
    "@builder.io/qwik": "^1.12.0",
  },
  devDependencies: {},
  compilerOptions: {
    jsx: "react-jsx",
    jsxImportSource: "@builder.io/qwik",
  },
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
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
        description: "Generating HTML template",
        emoji: "💻",
      },
      {
        filename: "src/main.tsx",
        content: `import '@builder.io/qwik/qwikloader.js';
import { render } from '@builder.io/qwik';
import { App } from './App';

render(document.getElementById('app') as HTMLElement, <App />);
`,
        description: "Generating Qwik entry",
        emoji: "💻",
      },
      {
        filename: "src/App.tsx",
        content: `import { component$ } from '@builder.io/qwik';

export const App = component$(() => {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>${name}</h1>
      <p>Frontend resource created with Flisk</p>
    </div>
  );
});
`,
        description: "Generating Qwik app",
        emoji: "💻",
      },
    ];
  },
};
