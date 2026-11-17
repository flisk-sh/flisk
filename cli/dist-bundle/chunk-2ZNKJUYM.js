import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  FliskError
} from "./chunk-73W4Y4TI.js";

// dist/utils/generated-cors.js
var LOCAL_FRONTEND_ORIGIN_PATTERN = String.raw`^https?://([a-z0-9-]+\.)+localhost(:\d+)?$`;
var LOCAL_FRONTEND_CORS_REASON = "The frontend runs on its own *.localhost origin (app.<project>.localhost), so the browser needs CORS to call this API.";
function localFrontendOriginConst() {
  return `const LOCAL_FRONTEND_ORIGIN = /${LOCAL_FRONTEND_ORIGIN_PATTERN.replaceAll("/", String.raw`\/`)}/;`;
}

// dist/utils/generated-port.js
function portFromEnv(name = "port", indent = "", fallback = 3e3) {
  if (!Number.isInteger(fallback) || fallback < 1 || fallback > 65535) {
    throw new RangeError("Port fallback must be an integer from 1 to 65535");
  }
  return [
    "const envPort = Number(process.env.PORT);",
    `const ${name} = Number.isInteger(envPort) && envPort >= 1 && envPort <= 65535 ? envPort : ${fallback};`
  ].map((line) => indent + line).join("\n");
}

// dist/backend-languages/bun.js
function getBackendIndexTemplate(name, _durability, options = {}) {
  return renderBackendIndex(name, false, options);
}
function getDrizzleBackendIndexTemplate(name, _durability, options = {}) {
  return renderBackendIndex(name, true, options);
}
function renderBackendIndex(name, drizzle, options) {
  const drizzleImports = drizzle ? "import { sql } from 'drizzle-orm';\nimport { db } from './db.js';\n" : "";
  const drizzleRoute = drizzle ? `// Database check: runs a trivial query through the Drizzle client (src/db.ts).
app.get('/health/db', async (c) => {
  try {
    await db.execute(sql\`select 1\`);
    return c.json({ status: 'ok', database: 'up' });
  } catch (error) {
    console.error('Database health check failed:', error);
    return c.json({ status: 'error', database: 'down' }, 503);
  }
});

` : "";
  return `import { Hono } from 'hono';
import { cors } from 'hono/cors';
${drizzleImports}
const app = new Hono();

// ${LOCAL_FRONTEND_CORS_REASON}
${localFrontendOriginConst()}
app.use('*', cors({ origin: (origin) => (LOCAL_FRONTEND_ORIGIN.test(origin) ? origin : undefined) }));

// Health check: Flisk uses this endpoint to check service health
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: '${name}' });
});

app.get('/health/live', (c) => {
  return c.json({ status: 'alive', timestamp: Date.now() });
});

app.get('/health/ready', async (c) => {
  const dependencies: Record<string, string> = {};
  let allReady = true;

  // Add dependency checks here (database, cache, etc.)
  // Mark allReady = false if any dependency is unhealthy

  const status = allReady ? 'ready' : 'not_ready';
  return c.json({ status, dependencies }, allReady ? 200 : 503);
});

${drizzleRoute}app.get('/', (c) => {
  return c.json({
    service: '${name}',
    version: '1.0.0',
    endpoints: ['/health', '/health/live', '/health/ready'${drizzle ? ", '/health/db'" : ""}]
  });
});

${portFromEnv("port", "", options.port)}
console.log('\\n\u{1F680} ${name} running on http://localhost:' + port);
console.log('\u{1F4CA} Health check: http://localhost:' + port + '/health\\n');

export default {
  port,
  fetch: app.fetch,
};
`;
}
var bunBackendProvider = {
  id: "bun",
  label: "Bun + Hono",
  installHint: "bun install"
};

// dist/backend-languages/go.js
var GO_DEV_COMMAND = "go run .";
var goBackendProvider = {
  id: "go",
  label: "Go 1.23 (net/http)",
  devCommand: GO_DEV_COMMAND,
  watch: ["**/*.go", "go.mod", "go.sum"],
  installHint: "go mod tidy   # optional: Docker builds the image for you",
  createFiles(name) {
    return [
      {
        filename: "go.mod",
        content: `module ${name}

go 1.23
`,
        description: "Generating go.mod",
        emoji: "\u{1F4E6}"
      },
      {
        filename: "main.go",
        content: `package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"regexp"
	"strconv"
)

// ${LOCAL_FRONTEND_CORS_REASON}
var localFrontendOrigin = regexp.MustCompile(\`${LOCAL_FRONTEND_ORIGIN_PATTERN}\`)

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("failed to encode JSON response: %v", err)
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Add("Vary", "Origin")
		if origin := r.Header.Get("Origin"); localFrontendOrigin.MatchString(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			if r.Method == http.MethodOptions {
				w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, PUT, POST, DELETE, PATCH")
				w.Header().Set("Access-Control-Allow-Headers", r.Header.Get("Access-Control-Request-Headers"))
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func newMux() *http.ServeMux {
	mux := http.NewServeMux()

	// Health check: Flisk uses this endpoint to check service health
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "${name}"})
	})

	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"service":   "${name}",
			"version":   "1.0.0",
			"endpoints": []string{"/health"},
		})
	})

	return mux
}

func portFromEnv() string {
	port := os.Getenv("PORT")
	number, err := strconv.Atoi(port)
	if err != nil || number < 1 || number > 65535 {
		return "3000"
	}
	return port
}

func main() {
	port := portFromEnv()

	// ":" + port listens on every interface, which Traefik needs inside the container network.
	log.Printf("${name} listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, withCORS(newMux())))
}
`,
        description: "Generating backend source",
        emoji: "\u{1F4BB}"
      },
      {
        filename: "main_test.go",
        content: `package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealth(t *testing.T) {
	rec := httptest.NewRecorder()
	newMux().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("GET /health = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestRoot(t *testing.T) {
	rec := httptest.NewRecorder()
	newMux().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("GET / = %d, want %d", rec.Code, http.StatusOK)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("GET / Content-Type = %q, want %q", got, "application/json")
	}

	var body map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("GET / body is not JSON: %v", err)
	}
	if body["service"] != "${name}" {
		t.Errorf("service = %v, want %q", body["service"], "${name}")
	}
	if body["version"] != "1.0.0" {
		t.Errorf("version = %v, want %q", body["version"], "1.0.0")
	}
	endpoints, ok := body["endpoints"].([]any)
	if !ok || len(endpoints) != 1 || endpoints[0] != "/health" {
		t.Errorf("endpoints = %v, want [/health]", body["endpoints"])
	}
}

func TestPortFromEnv(t *testing.T) {
	cases := []struct{ value, want string }{
		{"", "3000"},
		{"abc", "3000"},
		{"70000", "3000"},
		{"0", "3000"},
		{"-1", "3000"},
		{"3000.5", "3000"},
		{"3001", "3001"},
		{"65535", "65535"},
	}
	for _, tt := range cases {
		t.Run(tt.value, func(t *testing.T) {
			t.Setenv("PORT", tt.value)
			if got := portFromEnv(); got != tt.want {
				t.Errorf("portFromEnv() = %q, want %q", got, tt.want)
			}
		})
	}
}
`,
        description: "Generating smoke test",
        emoji: "\u{1F9EA}"
      }
    ];
  }
};

// dist/backend-languages/node.js
var NODE_DEV_COMMAND = "node --watch src/index.js";
var nodeBackendProvider = {
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
        emoji: "\u{1F4E6}"
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
        emoji: "\u{1F512}"
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

  // A network-path or absolute target must not route against a different authority.
  if (req.url?.startsWith("//") || url.origin !== "http://localhost") {
    return sendJson(res, 400, { error: "Bad Request" });
  }

  if (handleCors(req, res)) return;

  // Health check: Flisk uses this endpoint to check service health
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
    console.log(\`\\n\u{1F680} \${name} running on http://localhost:\${port}\`);
    console.log(\`\u{1F4CA} Health check: http://localhost:\${port}/health\\n\`);
  });
}
`,
        description: "Generating backend source",
        emoji: "\u{1F4BB}"
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

  it("rejects malformed or authority-changing targets and keeps serving requests", async () => {
    for (const path of [
      "//",
      "///",
      "//other-host/health",
      "//localhost/health",
      "http://other-host/health",
    ]) {
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
        emoji: "\u{1F9EA}"
      }
    ];
  }
};

// dist/backend-languages/python.js
var PYTHON_DEV_COMMAND = "uvicorn main:app --app-dir src --host 0.0.0.0 --port ${PORT:-4000} --reload --reload-dir src";
var pythonBackendProvider = {
  id: "python",
  label: "Python 3.12 + FastAPI",
  devCommand: PYTHON_DEV_COMMAND,
  watch: ["src/**/*"],
  installHint: 'pip install -e ".[dev]"   # optional: Docker builds the image for you',
  createFiles(name) {
    return [
      {
        filename: "pyproject.toml",
        content: `[project]
name = "${name}"
version = "0.0.1"
requires-python = ">=3.12"
dependencies = [
  "fastapi==0.115.6",
  "uvicorn[standard]==0.34.0",
]

[project.optional-dependencies]
dev = [
  "pytest==9.0.3",
  "httpx==0.28.1",
]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

# Only the dependencies are installed into the image; the source is synced for live reload.
[tool.setuptools]
py-modules = []

[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
`,
        description: "Generating pyproject.toml",
        emoji: "\u{1F4E6}"
      },
      {
        filename: "src/main.py",
        content: `import os
import socket
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="${name}")

# ${LOCAL_FRONTEND_CORS_REASON}
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"${LOCAL_FRONTEND_ORIGIN_PATTERN}",
    allow_methods=["*"],
    allow_headers=["*"],
)


def check_database() -> str | None:
    """None when the database answers, or when this service has none; otherwise the reason it does not.

    Flisk sets DATABASE_URL when service.json lists the database in dependsOn. With a Postgres driver installed (psycopg or
    psycopg2) this runs SELECT 1, so a wrong password fails here; without one it only checks that the port accepts connections.
    """
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        return None
    parts = urlsplit(url)
    # Prisma's ?schema= is not a libpq parameter, and libpq refuses a URL that carries it.
    query = urlencode([(key, value) for key, value in parse_qsl(parts.query) if key != "schema"])
    url = urlunsplit(parts._replace(query=query))
    try:
        try:
            from psycopg import connect
        except ImportError:
            try:
                from psycopg2 import connect
            except ImportError:
                connect = None
        if connect is None:
            with socket.create_connection((parts.hostname or "localhost", parts.port or 5432), timeout=2):
                return None
        connection = connect(url, connect_timeout=2)
        try:
            connection.cursor().execute("SELECT 1")
        finally:
            connection.close()
    except Exception as error:  # any failure means "not ready"; the reason goes into the response
        return f"database is not reachable: {error}".strip()
    return None


@app.get("/health")
def health(response: Response) -> dict[str, str]:
    # Ready means the server and its database are both up, so services that wait for this one start only then.
    database_error = check_database()
    if database_error:
        response.status_code = 503
        return {"status": "error", "service": "${name}", "database": database_error}
    return {"status": "ok", "service": "${name}"}


@app.get("/")
def root() -> dict[str, object]:
    return {"service": "${name}", "version": "1.0.0", "endpoints": ["/health"]}


def read_port() -> int:
    try:
        port = int(os.environ.get("PORT", "3000"))
    except ValueError:
        return 3000
    return port if 1 <= port <= 65535 else 3000


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=read_port())
`,
        description: "Generating backend source",
        emoji: "\u{1F4BB}"
      },
      {
        filename: "tests/test_health.py",
        content: `from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "${name}"}


def test_health_reports_an_unreachable_database(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:secret@127.0.0.1:1/app?schema=public")
    response = client.get("/health")
    assert response.status_code == 503
    assert response.json()["status"] == "error"
    assert "database is not reachable" in response.json()["database"]


def test_root() -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"service": "${name}", "version": "1.0.0", "endpoints": ["/health"]}
`,
        description: "Generating test file",
        emoji: "\u{1F9EA}"
      }
    ];
  }
};

// dist/backend-languages/rust.js
var RUST_DEV_COMMAND = "cargo run";
var rustBackendProvider = {
  id: "rust",
  label: "Rust (axum)",
  devCommand: RUST_DEV_COMMAND,
  watch: ["src/**/*.rs", "Cargo.toml", "Cargo.lock"],
  installHint: "cargo build   # optional: Docker builds the image for you",
  createFiles(name) {
    return [
      {
        filename: "Cargo.toml",
        content: `[package]
name = "${name}"
version = "0.1.0"
edition = "2021"

# The image copies the release binary by this fixed name.
[[bin]]
name = "app"
path = "src/main.rs"

[dependencies]
axum = "0.8"
regex = "1"
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "net"] }
tower-http = { version = "0.6", features = ["cors"] }
`,
        description: "Generating Cargo.toml",
        emoji: "\u{1F4E6}"
      },
      {
        filename: "src/main.rs",
        content: `use axum::{http::HeaderValue, routing::get, Json, Router};
use regex::Regex;
use serde_json::{json, Value};
use tower_http::cors::{AllowOrigin, Any, CorsLayer};

// ${LOCAL_FRONTEND_CORS_REASON}
fn local_frontend_cors() -> CorsLayer {
    let local_frontend = Regex::new(r"${LOCAL_FRONTEND_ORIGIN_PATTERN}").expect("valid origin pattern");
    CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(move |origin: &HeaderValue, _| {
            origin.to_str().is_ok_and(|origin| local_frontend.is_match(origin))
        }))
        .allow_methods(Any)
        .allow_headers(Any)
}

fn app() -> Router {
    Router::new()
        .route("/", get(root))
        // Health check: Flisk uses this endpoint to check service health
        .route("/health", get(health))
        .layer(local_frontend_cors())
}

async fn root() -> Json<Value> {
    Json(json!({ "service": "${name}", "version": "1.0.0", "endpoints": ["/health"] }))
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "service": "${name}" }))
}

fn parse_port(value: &str) -> u16 {
    value.parse::<u16>().ok().filter(|port| *port != 0).unwrap_or(3000)
}

#[tokio::main]
async fn main() {
    let port = parse_port(&std::env::var("PORT").unwrap_or_default());

    // 0.0.0.0 listens on every interface, which Traefik needs inside the container network.
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("failed to bind the port");
    println!("${name} listening on 0.0.0.0:{port}");
    axum::serve(listener, app()).await.expect("server error");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn health_reports_ok() {
        let Json(body) = health().await;
        assert_eq!(body["status"], "ok");
    }

    #[test]
    fn port_validation() {
        for invalid in ["", "abc", "70000", "0", "-1", "3000.5"] {
            assert_eq!(parse_port(invalid), 3000);
        }
        assert_eq!(parse_port("3001"), 3001);
        assert_eq!(parse_port("65535"), 65535);
    }
}
`,
        description: "Generating backend source and smoke test",
        emoji: "\u{1F4BB}"
      }
    ];
  }
};

// dist/backend-languages/registry.js
var DEFAULT_BACKEND_LANGUAGE = "bun";
var BACKEND_LANGUAGES = {
  bun: bunBackendProvider,
  python: pythonBackendProvider,
  go: goBackendProvider,
  rust: rustBackendProvider,
  node: nodeBackendProvider
};
function getBackendLanguage(languageId) {
  const id = (languageId ?? DEFAULT_BACKEND_LANGUAGE).trim().toLowerCase();
  const provider = Object.hasOwn(BACKEND_LANGUAGES, id) ? BACKEND_LANGUAGES[id] : void 0;
  if (!provider) {
    const supportedIds = Object.keys(BACKEND_LANGUAGES).join(", ");
    throw new FliskError(`Unknown backend language "${languageId}". Supported languages: ${supportedIds}.`, [`Use one of: ${supportedIds}`, `Omit --language to use ${DEFAULT_BACKEND_LANGUAGE}`]);
  }
  return provider;
}
function resolveBackendLanguage(resourceType, languageId) {
  if (resourceType !== "backend") {
    if (languageId !== void 0) {
      throw new FliskError("--language can only be used with --type backend.", [
        "Add --type backend, or drop --language for this resource type"
      ]);
    }
    return void 0;
  }
  return getBackendLanguage(languageId);
}

export {
  LOCAL_FRONTEND_CORS_REASON,
  localFrontendOriginConst,
  portFromEnv,
  getBackendIndexTemplate,
  getDrizzleBackendIndexTemplate,
  DEFAULT_BACKEND_LANGUAGE,
  BACKEND_LANGUAGES,
  getBackendLanguage,
  resolveBackendLanguage
};
