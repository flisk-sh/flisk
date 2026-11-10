// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { LOCAL_FRONTEND_CORS_REASON, localFrontendOriginConst } from "../utils/generated-cors.js";
import { portFromEnv } from "../utils/generated-port.js";
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
${portFromEnv()}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// ${LOCAL_FRONTEND_CORS_REASON}
${localFrontendOriginConst()}

// Sets the CORS headers for a local frontend, and answers the browser's preflight. True when the request is finished.
function handleCors(req, res) {
  const origin = req.headers.origin;
  if (!origin || !LOCAL_FRONTEND_ORIGIN.test(origin)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  if (req.method !== "OPTIONS") return false;
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, PUT, POST, DELETE, PATCH");
  res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] ?? "");
  res.writeHead(204);
  res.end();
  return true;
}

/** Reject malformed request targets before processing CORS or application routes. */
function handleRequest(req, res) {
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    return sendJson(res, 400, { error: "Bad Request" });
  }

  if (handleCors(req, res)) return;

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
}

export const server = http.createServer(handleRequest);

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
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { server } from "../src/index.js";

describe("health check", () => {
  let baseUrl;

  function requestTarget(path, options = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(baseUrl, { ...options, path }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: body ? JSON.parse(body) : null,
          });
        });
      });
      req.on("error", reject);
      req.end();
    });
  }

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

  it("GET / returns the original service metadata", async () => {
    const res = await fetch(\`\${baseUrl}/\`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      service: "${name}",
      version: "1.0.0",
      endpoints: ["/health"],
    });
  });

  it("returns JSON 400 for malformed targets and keeps serving requests", async () => {
    for (const path of ["//", "///"]) {
      const res = await requestTarget(path);
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { error: "Bad Request" });
    }

    const res = await requestTarget("/health", { headers: { Host: "bad host" } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: "ok", service: "${name}" });
  });

  it("rejects malformed CORS preflights but retains valid preflight responses", async () => {
    const origin = "http://app.demo.localhost";
    const options = { method: "OPTIONS", headers: { Origin: origin } };
    const malformed = await requestTarget("//", options);
    assert.equal(malformed.status, 400);
    assert.deepEqual(malformed.body, { error: "Bad Request" });

    const valid = await requestTarget("/health", options);
    assert.equal(valid.status, 204);
    assert.equal(valid.headers["access-control-allow-origin"], origin);
  });
});
`,
        description: "Generating smoke test",
        emoji: "🧪",
      },
    ];
  },
};
