export const litFrontendProvider = {
    id: "lit",
    label: "Lit + Vite",
    dependencies: {
        lit: "^3.2.0",
    },
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
    <app-root></app-root>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
                description: "Generating HTML template",
                emoji: "💻",
            },
            {
                filename: "src/main.ts",
                content: `import './app-root';
`,
                description: "Generating Lit entry",
                emoji: "💻",
            },
            {
                filename: "src/app-root.ts",
                content: `import { LitElement, css, html } from 'lit';

export class AppRoot extends LitElement {
  static styles = css\`
    :host {
      display: block;
      padding: 2rem;
      font-family: system-ui;
    }
  \`;

  render() {
    return html\`
      <h1>${name}</h1>
      <p>Frontend resource created with Flisk</p>
    \`;
  }
}

customElements.define('app-root', AppRoot);
`,
                description: "Generating Lit app",
                emoji: "💻",
            },
        ];
    },
};
