// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { FrontendFrameworkProvider } from "./types.js";

export const vanillaFrontendProvider: FrontendFrameworkProvider = {
  id: "vanilla",
  label: "Vanilla TypeScript + Vite",
  dependencies: {},
  devDependencies: {},
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
        content: `import { renderApp } from './app';

const root = document.getElementById('app');
if (root) {
  renderApp(root);
}
`,
        description: "Generating vanilla entry",
        emoji: "💻",
      },
      {
        filename: "src/app.ts",
        content: `export function renderApp(root: HTMLElement): void {
  root.style.padding = '2rem';
  root.style.fontFamily = 'system-ui';

  const title = document.createElement('h1');
  title.textContent = '${name}';

  const note = document.createElement('p');
  note.textContent = 'Frontend resource created with Flisk';

  root.replaceChildren(title, note);
}
`,
        description: "Generating vanilla app",
        emoji: "💻",
      },
    ];
  },
};
