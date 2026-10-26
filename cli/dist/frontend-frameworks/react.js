const STARTER_STYLES = `const page = { maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem', fontFamily: 'system-ui, sans-serif', color: '#1f2933' };
const muted = { color: '#616e7c', marginTop: 0 };
const card = { border: '1px solid #d9e2ec', borderRadius: 8, padding: '1rem 1.25rem', margin: '1.5rem 0' };
const cardHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const pre = { background: '#f5f7fa', borderRadius: 6, padding: '0.75rem', overflowX: 'auto' };
`;
/** Hints and links shared by both starters. They need no backend, so they appear in every frontend. */
const STARTER_HINTS = `      <p>Edit <code>src/App.tsx</code> and save. It live-reloads.</p>
      <ul>
        <li><a href="http://localhost:10350">Tilt UI</a>: logs and resource status</li>
        <li><code>flisk status</code>: every resource in this project</li>
      </ul>`;
function renderAppWithBackend(name, backendName) {
    return `/// <reference types="vite/client" />
import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const BACKEND_NAME = '${backendName}';

${STARTER_STYLES}
interface Health {
  ok: boolean;
  body: unknown;
}

function App() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(API_URL + '/health', { signal: controller.signal })
      .then(async (response) => setHealth({ ok: response.ok, body: await response.json() }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setHealth({ ok: false, body: { error: String(error) } });
      });
    return () => controller.abort();
  }, []);

  return (
    <main style={page}>
      <h1>${name}</h1>
      <p style={muted}>Flisk frontend</p>

      <section style={card}>
        <div style={cardHeader}>
          <strong>Backend: {BACKEND_NAME}</strong>
          {health === null && <span>checking…</span>}
          {health?.ok === true && <span style={{ color: '#0a7f3f' }}>ok</span>}
          {health?.ok === false && <span style={{ color: '#b42318' }}>unreachable</span>}
        </div>
        {health && <pre>{JSON.stringify(health.body, null, 2)}</pre>}
      </section>

${STARTER_HINTS}
    </main>
  );
}

export default App;
`;
}
function renderAppWithoutBackend(name) {
    return `${STARTER_STYLES}
function App() {
  return (
    <main style={page}>
      <h1>${name}</h1>
      <p style={muted}>Flisk frontend</p>

${STARTER_HINTS}
    </main>
  );
}

export default App;
`;
}
export const reactFrontendProvider = {
    id: "react",
    label: "React + Vite",
    dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0",
    },
    devDependencies: {
        "@types/react": "^19.0.0",
        "@types/react-dom": "^19.0.0",
        "@vitejs/plugin-react": "^4.3.4",
    },
    compilerOptions: {
        jsx: "react-jsx",
    },
    createFiles(name, options = {}) {
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
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
                description: "Generating HTML template",
                emoji: "💻",
            },
            {
                filename: "src/main.tsx",
                content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
                description: "Generating React entry",
                emoji: "💻",
            },
            {
                filename: "src/App.tsx",
                content: options.backendName
                    ? renderAppWithBackend(name, options.backendName)
                    : renderAppWithoutBackend(name),
                description: "Generating React app",
                emoji: "💻",
            },
        ];
    },
};
