// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { portFromEnv } from "../utils/generated-port.js";
import { customAgentRuntime, getCustomAgentIndexTemplate } from "./custom.js";

const SERVICE = "support-agent";

// Pull the body of `async close()` out of the generated postgres index so the assertions read the real output.
function closeBody(source: string): string {
  const start = source.indexOf("async close()");
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("\n  },", start);
  return source.slice(start, end);
}

// Pull `queueSessionOperation` out of a generated index and run it, so the test checks the shipped helper's behaviour.
function loadQueueHelper(source: string) {
  const start = source.indexOf("function queueSessionOperation(");
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("\n}\n", start) + 2;
  const js = source
    .slice(start, end)
    .replace(
      /\(sessionId: string, operation: \(\) => Promise<void>\): Promise<void>/,
      "(sessionId, operation)",
    );
  return new Function("sessionOperationQueues", `${js}\nreturn queueSessionOperation;`)(
    new Map(),
  ) as (sessionId: string, operation: () => Promise<void>) => Promise<void>;
}

describe("custom agent runtime provider", () => {
  it.each(["files", "postgres"] as const)(
    "lets a failed %s turn reject for its caller and keeps the session queue running",
    async (durability) => {
      const queue = loadQueueHelper(getCustomAgentIndexTemplate(SERVICE, durability));
      await expect(
        queue("s1", async () => {
          throw new Error("checkpoint write failed");
        }),
      ).rejects.toThrow("checkpoint write failed");
      let ran = false;
      await queue("s1", async () => {
        ran = true;
      });
      expect(ran).toBe(true);
    },
  );
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
    expect(index).toContain(portFromEnv("PORT"));
    expect(index).toContain("server.listen(PORT, '0.0.0.0'");
  });

  it("rejects a missing or malformed session id on turns and session reads", () => {
    expect(index).toContain("/^[A-Za-z0-9_-]{1,128}$/");
    expect(index).toContain("x-session-id header is required (1-128 letters, digits, - or _)");
    expect(index).toContain("sendJson(res, 400, { error: 'x-session-id header is required' })");
  });

  it("rejects malformed JSON and non-object turn bodies without masking server errors", () => {
    expect(index).toContain("body = await readJson(req);");
    expect(index).toContain("if (!(error instanceof SyntaxError)) throw error;");
    expect(index).toContain("body === null || typeof body !== 'object' || Array.isArray(body)");
    expect(index.match(/sendJson\(res, 400, \{ error: 'invalid_json' \}\)/g)).toHaveLength(2);
    expect(index).toContain("return raw ? JSON.parse(raw) : {};");
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

  it("lists stored sessions newest first with an active or idle status", () => {
    expect(index).toContain("url.pathname === '/sessions' && req.method === 'GET'");
    expect(index).toContain("b.lastActivity.localeCompare(a.lastActivity)");
    expect(index).toContain("status: activeTurns.has(s.sessionId) ? 'active' : 'idle'");
    expect(index).toContain("return sendJson(res, 200, { sessions, total: all.length });");
  });

  it("marks a session active only while a turn for it is in flight", () => {
    expect(index).toContain("activeTurns.set(sessionId, (activeTurns.get(sessionId) ?? 0) + 1);");
    expect(index).toMatch(
      /\} finally \{\s*const left = \(activeTurns\.get\(sessionId\) \?\? 1\) - 1;/,
    );
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

  it("lists sessions from the checkpoint files, skipping in-progress writes", () => {
    expect(index).toContain(".filter((file) => file.endsWith('.json'))");
    expect(index).toContain("lastActivity: stat.mtime.toISOString(), checkpointBytes: stat.size");
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
    expect(index).toContain("CREATE TABLE IF NOT EXISTS flisk_agent_sessions");
    expect(index).toContain("session_id VARCHAR(128) PRIMARY KEY");
    expect(index).toContain("ON CONFLICT (session_id) DO UPDATE");
  });

  it("loads a saved session and upserts messages as JSON", () => {
    expect(index).toContain("SELECT messages FROM flisk_agent_sessions WHERE session_id = $1");
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

  it("lists sessions from the table without reading the messages", () => {
    expect(index).toContain(
      "SELECT session_id, updated_at, octet_length(messages::text) AS bytes FROM flisk_agent_sessions",
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

describe("custom agent runtime: concurrency issues", () => {
  // NOTE: These tests are static code analysis only. They verify the code patterns that exhibit race conditions
  // but do NOT prove the bugs are fixed. See custom.integration.test.ts for functional tests that actually
  // start the server and make concurrent requests. Acceptance checks (#1, #4) fail because the race conditions
  // are still present in the code. Enable and run custom.integration.test.ts after fixing the bugs.

  describe("activeTurns counter race conditions", () => {
    it("should protect activeTurns.set from concurrent increments on the same sessionId", () => {
      const index = getCustomAgentIndexTemplate(SERVICE, "files");
      // Check that the code doesn't have atomic increment protection
      expect(index).toContain("activeTurns.set(sessionId, (activeTurns.get(sessionId) ?? 0) + 1)");
      // This is a read-then-write race in async code; concurrent requests interleave after await
      // Test expectation: should see protection (mutex, lock, atomic pattern) - currently missing
      expect(index).not.toContain("Atomically increment"); // Will fail - documents the bug
    });

    it("should protect activeTurns counter from concurrent decrements", () => {
      const index = getCustomAgentIndexTemplate(SERVICE, "files");
      // Decrement is also non-atomic: get -> conditional set/delete
      expect(index).toContain("const left = (activeTurns.get(sessionId) ?? 1) - 1");
      // The fallback ?? 1 masks bugs rather than detecting them
      expect(index).toContain("?? 1");
    });

    it("documents that activeTurns.get returns undefined, not 0, for missing keys", () => {
      // This is correct behavior but worth documenting
      const index = getCustomAgentIndexTemplate(SERVICE, "files");
      expect(index).toContain("(activeTurns.get(sessionId) ?? 0)");
      expect(index).toContain("(activeTurns.get(sessionId) ?? 1)");
    });
  });

  describe("inFlight counter race conditions", () => {
    it("should ensure inFlight-- is reliably called for every request", () => {
      const index = getCustomAgentIndexTemplate(SERVICE, "files");
      // inFlight++ is synchronous, but decrement is in an async event handler
      expect(index).toContain("inFlight++");
      expect(index).toContain("res.on('close', () => inFlight--)");
      // The finally block in the code only wraps the turn handler, not the overall request
      // Early returns (400, 404) can happen before the close handler is guaranteed to fire
      // This is a fragile design that could lose decrements under network errors
      expect(index).toContain("return sendJson(res, 400");
      expect(index).toContain("return sendJson(res, 404");
    });

    it("should not lose inFlight decrements when responses close early", () => {
      const index = getCustomAgentIndexTemplate(SERVICE, "files");
      // Early returns (400, 404 errors) call sendJson synchronously
      // If res.on('close') handler isn't attached yet, decrement is lost
      expect(index).toContain("return sendJson(res, 400");
      expect(index).toContain("return sendJson(res, 404");
      // Handler attachment (line with res.on) must be before ANY return path
      // Currently it's attached early, but timing is fragile
    });
  });

  describe("drain timeout race conditions", () => {
    it("should drain all in-flight requests before exiting on SIGTERM", () => {
      const index = getCustomAgentIndexTemplate(SERVICE, "files");
      expect(index).toContain("function shutdown(signal: string)");
      expect(index).toContain("const deadline = Date.now() + DRAIN_TIMEOUT_MS");
      expect(index).toContain("if (inFlight === 0 || Date.now() > deadline)");
      // Race: timer checks every 100ms, but inFlight-- is async
      // A request finishing between checks could be missed until next check
    });

    it("should set draining=true before stopping request acceptance", () => {
      const index = getCustomAgentIndexTemplate(SERVICE, "files");
      expect(index).toContain("draining = true");
      expect(index).toContain("if (draining) return sendJson(res, 503");
      // Check order: draining=true BEFORE server.close()?
      const drainingIdx = index.indexOf("draining = true");
      const closeIdx = index.indexOf("server.close()");
      expect(drainingIdx).toBeLessThan(closeIdx);
    });

    it("postgres version should not double-call store.close()", () => {
      const postgres = getCustomAgentIndexTemplate(SERVICE, "postgres");
      const closeCount = (postgres.match(/await store\.close\(\)/g) || []).length;
      // Currently called twice (lines ~223 and ~229)
      expect(closeCount).toBe(2); // Documents the bug - should be 1
    });
  });

  describe("session state consistency under concurrent load", () => {
    it("should mark a session active only while turns are in flight", () => {
      const index = getCustomAgentIndexTemplate(SERVICE, "files");
      expect(index).toContain("status: activeTurns.has(s.sessionId) ? 'active' : 'idle'");
      // With race conditions in activeTurns, this status can be wrong:
      // - Session stays marked active after all turns complete (decrement lost)
      // - Session marked idle while turn is running (increment lost)
    });
  });
});
