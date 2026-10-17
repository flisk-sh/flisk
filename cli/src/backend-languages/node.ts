// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import type { BackendLanguageProvider } from "./types.js";

export const NODE_DEV_COMMAND = "node --watch src/index.js";

export const nodeBackendProvider: BackendLanguageProvider = {
  id: "node",
  label: "Node.js 22",
  devCommand: NODE_DEV_COMMAND,
  watch: ["src/**/*"],
  installHint: "npm install   # optional: Docker builds the image for you",
  createFiles(name) {
    return [
      {
        filename: "package.json",
        content: `{
  "name": "${name}",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "test": "node --test"
  }
}
`,
        description: "Generating package.json",
        emoji: "📦",
      },
      {
        // The generated Dockerfile runs `npm ci`, which needs a lockfile. This one matches the dependency-free package.json;
        // `npm install` regenerates it once the project adds dependencies.
        filename: "package-lock.json",
        content: `{
  "name": "${name}",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "${name}",
      "version": "1.0.0"
    }
  }
}
`,
        description: "Generating package-lock.json",
        emoji: "🔒",
      },
      {
        filename: "src/index.js",
        content: `import http from "node:http";

const name = "${name}";
const port = Number(process.env.PORT) || 3000;

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export const server = http.createServer((req, res) => {
  const url = new URL(req.url, \`http://\${req.headers.host || "localhost"}\`);

  // Health check endpoint (required by TILT_RESOURCE_DEFAULTS.star)
  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, { status: "ok", service: name });
  }

  if (req.method === "GET" && url.pathname === "/") {
    return sendJson(res, 200, {
      service: name,
      version: "1.0.0",
      endpoints: ["/health"],
    });
  }

  return sendJson(res, 404, { error: "Not Found" });
});

if (process.env.NODE_ENV !== "test") {
  // "0.0.0.0" listens on every interface, which Traefik needs inside the container network.
  server.listen(port, "0.0.0.0", () => {
    console.log(\`\\n🚀 \${name} running on http://localhost:\${port}\`);
    console.log(\`📊 Health check: http://localhost:\${port}/health\\n\`);
  });
}
`,
        description: "Generating backend source",
        emoji: "💻",
      },
      {
        filename: "tests/health.test.js",
        content: `import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { server } from "../src/index.js";

describe("health check", () => {
  let baseUrl;

  before((_, done) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      baseUrl = \`http://127.0.0.1:\${address.port}\`;
      done();
    });
  });

  after((_, done) => {
    server.close(done);
  });

  it("GET /health returns 200 with ok status", async () => {
    const res = await fetch(\`\${baseUrl}/health\`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { status: "ok", service: "${name}" });
  });
});
`,
        description: "Generating smoke test",
        emoji: "🧪",
      },
    ];
  },
};
