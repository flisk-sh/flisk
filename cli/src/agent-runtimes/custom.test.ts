// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { customAgentRuntime, getCustomAgentIndexTemplate } from "./custom.js";

const SERVICE = "support-agent";

// Pull the body of `async close()` out of the generated postgres index so the assertions read the real output.
function closeBody(source: string): string {
  const start = source.indexOf("async close()");
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("\n  },", start);
  return source.slice(start, end);
}

describe("custom agent runtime provider", () => {
  it("is a dependency-free provider backed by the exported template", () => {
    expect(customAgentRuntime.id).toBe("custom");
    expect(customAgentRuntime.dependencies).toEqual({});
    expect(customAgentRuntime.devDependencies).toEqual({});
    expect(customAgentRuntime.createIndex).toBe(getCustomAgentIndexTemplate);
  });

  it("defaults to files durability when durability is omitted", () => {
    const files = getCustomAgentIndexTemplate(SERVICE, "files");
    expect(getCustomAgentIndexTemplate(SERVICE)).toBe(files);
    expect(customAgentRuntime.createIndex(SERVICE)).toBe(files);
    expect(customAgentRuntime.createIndex(SERVICE, undefined)).toBe(files);
  });

  it("scaffolds postgres for postgres and files for anything else", () => {
    expect(customAgentRuntime.createIndex(SERVICE, "postgres")).toContain("from 'pg'");
    // Callers validate through resolveAgentDurability; an unexpected value still gets the files store.
    expect(customAgentRuntime.createIndex(SERVICE, "redis")).toBe(
      getCustomAgentIndexTemplate(SERVICE, "files"),
    );
    expect(customAgentRuntime.createIndex(SERVICE, "")).toBe(
      getCustomAgentIndexTemplate(SERVICE, "files"),
    );
  });
});

describe.each(["files", "postgres"] as const)("%s durability template", (durability) => {
  const index = getCustomAgentIndexTemplate(SERVICE, durability);

  it("names the service in the health response and the startup log", () => {
    expect(index).toContain(`{ status: 'ok', service: '${SERVICE}', draining }`);
    expect(index).toContain(`${SERVICE} agent on http://localhost:`);
    expect(index).not.toMatch(/\$\{name\}/);
  });

  it("serves health, readiness, turns and session reads on the injected port", () => {
    expect(index).toContain("if (url.pathname === '/health')");
    expect(index).toContain("if (url.pathname === '/ready')");
    expect(index).toContain("url.pathname === '/turn' && req.method === 'POST'");
    expect(index).toContain("url.pathname === '/session' && req.method === 'GET'");
    expect(index).toContain("sendJson(res, ok ? 200 : 503, { ready: ok, durability: DURABILITY })");
    expect(index).toContain("const PORT = Number(process.env.PORT || 3000);");
    expect(index).toContain("server.listen(PORT, '0.0.0.0'");
  });

  it("rejects a missing or malformed session id on turns and session reads", () => {
    expect(index).toContain("/^[A-Za-z0-9_-]{1,128}$/");
    expect(index).toContain("x-session-id header is required (1-128 letters, digits, - or _)");
    expect(index).toContain("sendJson(res, 400, { error: 'x-session-id header is required' })");
  });

  it("stores both sides of a turn before answering", () => {
    expect(index).toContain(
      "checkpoint.messages.push({ role: 'user', content: input, at: new Date().toISOString() });",
    );
    expect(index).toContain("const reply = await runTurn(checkpoint, input);");
    expect(index).toContain("await store.save(checkpoint);");
    expect(index).toContain("turns: checkpoint.messages.length / 2");
  });

  it("drains in-flight turns on SIGTERM and SIGINT, then exits 0", () => {
    expect(index).toContain("const DRAIN_TIMEOUT_MS = 10_000;");
    expect(index).toContain("function shutdown(signal: string)");
    expect(index).toContain("if (draining) return;");
    expect(index).toContain("process.exit(0);");
    expect(index).toContain("process.on('SIGTERM', () => shutdown('SIGTERM'));");
    expect(index).toContain("process.on('SIGINT', () => shutdown('SIGINT'));");
  });

  it("answers unknown paths with 404 and failed requests with 500", () => {
    expect(index).toContain("return sendJson(res, 404, { error: 'not_found' });");
    expect(index).toContain("return sendJson(res, 500, { error: 'internal_error' });");
  });
});

describe("files durability template", () => {
  const index = getCustomAgentIndexTemplate(SERVICE, "files");

  it("keeps one JSON checkpoint per session in AGENT_STATE_DIR", () => {
    expect(index).toContain("process.env.AGENT_STATE_DIR || join(process.cwd(), '.agent-state')");
    expect(index).toContain("join(STATE_DIR, sessionId + '.json')");
    expect(index).toContain("mkdirSync(STATE_DIR, { recursive: true })");
  });

  it("writes checkpoints atomically and starts a missing session empty", () => {
    expect(index).toContain("const tmp = file + '.' + process.pid + '.tmp';");
    expect(index).toContain("writeFileSync(tmp, JSON.stringify(checkpoint));");
    expect(index).toContain("renameSync(tmp, file);");
    expect(index).toContain(
      "existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { sessionId, messages: [] }",
    );
  });

  it("has no postgres dependency", () => {
    expect(index).not.toContain("from 'pg'");
    expect(index).not.toContain("DATABASE_URL");
  });
});

describe("postgres durability template", () => {
  const index = getCustomAgentIndexTemplate(SERVICE, "postgres");

  it("connects through DATABASE_URL and creates the checkpoint table once", () => {
    expect(index).toContain(
      "process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres'",
    );
    expect(index).toContain("new Client({ connectionString: DATABASE_URL })");
    expect(index).toContain("CREATE TABLE IF NOT EXISTS tdk_agent_sessions");
    expect(index).toContain("session_id VARCHAR(128) PRIMARY KEY");
    expect(index).toContain("ON CONFLICT (session_id) DO UPDATE");
  });

  it("loads a saved session and upserts messages as JSON", () => {
    expect(index).toContain("SELECT messages FROM tdk_agent_sessions WHERE session_id = $1");
    expect(index).toContain("return { sessionId, messages: res.rows[0].messages };");
    expect(index).toContain("JSON.stringify(checkpoint.messages)");
  });

  it("reports not ready and drops the client when the database is unreachable", () => {
    expect(index).toContain("await c.query('SELECT 1');");
    expect(index).toMatch(/catch \{\s*client = null;\s*return false;\s*\}/);
  });

  it("serves an empty checkpoint when a session load fails", () => {
    expect(index).toMatch(
      /catch \(err\) \{\s*console\.error\('\[agent\] load checkpoint failed:', err\);\s*return \{ sessionId, messages: \[\] \};\s*\}/,
    );
  });

  it("does not use the files checkpoint store", () => {
    expect(index).not.toContain("AGENT_STATE_DIR");
    expect(index).not.toContain("renameSync");
  });
});

describe("custom agent runtime: postgres close()", () => {
  const close = closeBody(getCustomAgentIndexTemplate(SERVICE, "postgres"));

  it("logs a failed client.end() instead of swallowing it", () => {
    expect(close).toContain("client.end()");
    expect(close).toContain("console.warn");
    expect(close).not.toMatch(/catch\s*\{\s*\}/);
  });

  it("clears the client even when end() fails", () => {
    const tail = close.slice(close.indexOf("catch"));
    expect(tail).toContain("client = null;");
  });
});
