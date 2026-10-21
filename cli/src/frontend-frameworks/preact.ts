// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { FrontendFrameworkProvider } from "./types.js";

export const preactFrontendProvider: FrontendFrameworkProvider = {
  id: "preact",
  label: "Preact + Vite",
  dependencies: {
    preact: "^10.26.0",
  },
  devDependencies: {
    "@preact/preset-vite": "^2.10.0",
  },
  compilerOptions: {
    jsx: "react-jsx",
    jsxImportSource: "preact",
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
        content: `import { render } from 'preact';
import App from './App';

render(<App />, document.getElementById('app')!);
`,
        description: "Generating Preact entry",
        emoji: "💻",
      },
      {
        filename: "src/App.tsx",
        content: `function App() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>${name}</h1>
      <p>Frontend resource created with Flisk</p>
    </div>
  );
}

export default App;
`,
        description: "Generating Preact app",
        emoji: "💻",
      },
    ];
  },
};
