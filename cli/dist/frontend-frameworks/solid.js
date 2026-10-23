export const solidFrontendProvider = {
    id: "solid",
    label: "Solid + Vite",
    dependencies: {
        "solid-js": "^1.9.0",
    },
    devDependencies: {
        "vite-plugin-solid": "^2.11.0",
    },
    compilerOptions: {
        jsx: "preserve",
        jsxImportSource: "solid-js",
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
                content: `import { render } from 'solid-js/web';
import App from './App';

render(() => <App />, document.getElementById('app')!);
`,
                description: "Generating Solid entry",
                emoji: "💻",
            },
            {
                filename: "src/App.tsx",
                content: `function App() {
  return (
    <div style={{ padding: '2rem', 'font-family': 'system-ui' }}>
      <h1>${name}</h1>
      <p>Frontend resource created with Flisk</p>
    </div>
  );
}

export default App;
`,
                description: "Generating Solid app",
                emoji: "💻",
            },
        ];
    },
};
