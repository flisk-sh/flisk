// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import type { BackendFrameworkProvider } from "../backend-frameworks/types.js";

/**
 * The `custom` agent runtime: a plain Bun HTTP service with no model SDK, no agent framework and no vendor dependency.
 * It is the escape hatch the agent resource type is built on. Replace the `runTurn` body with your model call and tools;
 * the process contract around it (health, readiness, session checkpoints, SIGTERM drain) is what TDK relies on.
 */
export function getCustomAgentIndexTemplate(
  name: string,
  durability: "files" | "postgres" = "files",
) {
  if (durability === "postgres") {
    return `import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Client } from 'pg';

// Contract with TDK (see docs/agents/ai-agents.md):
//   AGENT_DURABILITY  postgres
//   DATABASE_URL      Postgres connection string injected by TDK
//   PORT              port to listen on
// /health: the process is alive. /ready: the checkpoint store is reachable. Idle is healthy, so /health never checks the store.

const DURABILITY = 'postgres';
const PORT = Number(process.env.PORT || 3000);
const DRAIN_TIMEOUT_MS = 10_000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

interface Checkpoint {
  sessionId: string;
  messages: Array<{ role: 'user' | 'agent'; content: string; at: string }>;
}

let client: Client | null = null;
let initialized = false;

async function getClient(): Promise<Client> {
  if (client) return client;
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  if (!initialized) {
    await c.query(\`
      CREATE TABLE IF NOT EXISTS tdk_agent_sessions (
        session_id VARCHAR(128) PRIMARY KEY,
        messages JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    \`);
    initialized = true;
  }
  client = c;
  return client;
}

const store = {
  async ready(): Promise<boolean> {
    try {
      const c = await getClient();
      await c.query('SELECT 1');
      return true;
    } catch {
      client = null;
      return false;
    }
  },
  async load(sessionId: string): Promise<Checkpoint> {
    try {
      const c = await getClient();
      const res = await c.query('SELECT messages FROM tdk_agent_sessions WHERE session_id = $1', [sessionId]);
      if (res.rows.length > 0 && res.rows[0].messages) {
        return { sessionId, messages: res.rows[0].messages };
      }
      return { sessionId, messages: [] };
    } catch (err) {
      console.error('[agent] load checkpoint failed:', err);
      return { sessionId, messages: [] };
    }
  },
  async save(checkpoint: Checkpoint): Promise<void> {
    const c = await getClient();
    await c.query(
      \`INSERT INTO tdk_agent_sessions (session_id, messages, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (session_id) DO UPDATE
       SET messages = EXCLUDED.messages, updated_at = NOW()\`,
      [checkpoint.sessionId, JSON.stringify(checkpoint.messages)],
    );
  },
  async close(): Promise<void> {
    if (client) {
      try {
        await client.end();
      } catch {}
      client = null;
    }
  },
};

// Replace this with the agent's work: call your model, run tools, return the reply. Keep it a pure function of the
// checkpoint so a resumed session continues from what was saved.
async function runTurn(checkpoint: Checkpoint, input: string): Promise<string> {
  // The caller has already appended this turn's user message, so the turn number is half the message count, rounded up.
  return 'received ' + input + ' (turn ' + Math.ceil(checkpoint.messages.length / 2) + ')';
}

let draining = false;
let inFlight = 0;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (req, res) => {
  inFlight++;
  res.on('close', () => inFlight--);
  const url = new URL(req.url ?? '/', 'http://localhost');

  try {
    if (url.pathname === '/health') {
      return sendJson(res, 200, { status: 'ok', service: '${name}', draining });
    }

    if (url.pathname === '/ready') {
      const ok = !draining && (await store.ready());
      return sendJson(res, ok ? 200 : 503, { ready: ok, durability: DURABILITY });
    }

    // Session routing: the session id comes from the x-session-id header, so several instances of one agent can
    // share a Traefik route and each session still reaches its own checkpoint.
    if (url.pathname === '/turn' && req.method === 'POST') {
      if (draining) return sendJson(res, 503, { error: 'draining' });
      const sessionId = String(req.headers['x-session-id'] ?? '');
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) {
        return sendJson(res, 400, { error: 'x-session-id header is required (1-128 letters, digits, - or _)' });
      }
      const body = await readJson(req);
      const input = String(body.input ?? '');
      const checkpoint = await store.load(sessionId);
      checkpoint.messages.push({ role: 'user', content: input, at: new Date().toISOString() });
      const reply = await runTurn(checkpoint, input);
      checkpoint.messages.push({ role: 'agent', content: reply, at: new Date().toISOString() });
      await store.save(checkpoint);
      return sendJson(res, 200, { sessionId, reply, turns: checkpoint.messages.length / 2 });
    }

    if (url.pathname === '/session' && req.method === 'GET') {
      const sessionId = String(req.headers['x-session-id'] ?? '');
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) return sendJson(res, 400, { error: 'x-session-id header is required' });
      const checkpoint = await store.load(sessionId);
      return sendJson(res, 200, { sessionId, turns: checkpoint.messages.length / 2, messages: checkpoint.messages });
    }

    return sendJson(res, 404, { error: 'not_found' });
  } catch (error) {
    console.error('[agent] request failed:', error);
    return sendJson(res, 500, { error: 'internal_error' });
  }
});

// Bind beyond loopback: Traefik reaches the container over the Docker network.
server.listen(PORT, '0.0.0.0', () => {
  console.log('\\n🤖 ${name} agent on http://localhost:' + PORT + ' (durability: ' + DURABILITY + ')');
});

// Drain on SIGTERM (tdk down, hot reload, docker stop): stop taking turns, let in-flight turns finish, then exit 0.
// Checkpoints are written before a turn is answered, so a drained exit loses no acknowledged turn.
function shutdown(signal: string) {
  if (draining) return;
  draining = true;
  console.log('[agent] ' + signal + ' received, draining ' + inFlight + ' in-flight request(s)');
  server.close(async () => {
    await store.close();
  });
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  const timer = setInterval(async () => {
    if (inFlight === 0 || Date.now() > deadline) {
      clearInterval(timer);
      await store.close();
      process.exit(0);
    }
  }, 100);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
`;
  }

  return `import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Contract with TDK (see docs/agents/ai-agents.md):
//   AGENT_DURABILITY  files   (set by tdk from service.json agent.durability)
//   AGENT_STATE_DIR   where files-durability checkpoints live (a named volume that survives tdk down)
//   PORT              port to listen on
// /health: the process is alive. /ready: the checkpoint store is reachable. Idle is healthy, so /health never checks the store.

const DURABILITY = 'files';
const STATE_DIR = process.env.AGENT_STATE_DIR || join(process.cwd(), '.agent-state');
const PORT = Number(process.env.PORT || 3000);
const DRAIN_TIMEOUT_MS = 10_000;

interface Checkpoint {
  sessionId: string;
  messages: Array<{ role: 'user' | 'agent'; content: string; at: string }>;
}

// Session store. files: one JSON checkpoint per session, written atomically (temp file, then rename), so a kill
// mid-write leaves the previous checkpoint intact.
const store = {
  ready(): boolean {
    try {
      mkdirSync(STATE_DIR, { recursive: true });
      return true;
    } catch {
      return false;
    }
  },
  load(sessionId: string): Checkpoint {
    const file = join(STATE_DIR, sessionId + '.json');
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { sessionId, messages: [] };
  },
  save(checkpoint: Checkpoint): void {
    mkdirSync(STATE_DIR, { recursive: true });
    const file = join(STATE_DIR, checkpoint.sessionId + '.json');
    const tmp = file + '.' + process.pid + '.tmp';
    writeFileSync(tmp, JSON.stringify(checkpoint));
    renameSync(tmp, file);
  },
};

// Replace this with the agent's work: call your model, run tools, return the reply. Keep it a pure function of the
// checkpoint so a resumed session continues from what was saved.
async function runTurn(checkpoint: Checkpoint, input: string): Promise<string> {
  // The caller has already appended this turn's user message, so the turn number is half the message count, rounded up.
  return 'received ' + input + ' (turn ' + Math.ceil(checkpoint.messages.length / 2) + ')';
}

let draining = false;
let inFlight = 0;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (req, res) => {
  inFlight++;
  res.on('close', () => inFlight--);
  const url = new URL(req.url ?? '/', 'http://localhost');

  try {
    if (url.pathname === '/health') {
      return sendJson(res, 200, { status: 'ok', service: '${name}', draining });
    }

    if (url.pathname === '/ready') {
      const ok = !draining && (await store.ready());
      return sendJson(res, ok ? 200 : 503, { ready: ok, durability: DURABILITY });
    }

    // Session routing: the session id comes from the x-session-id header, so several instances of one agent can
    // share a Traefik route and each session still reaches its own checkpoint.
    if (url.pathname === '/turn' && req.method === 'POST') {
      if (draining) return sendJson(res, 503, { error: 'draining' });
      const sessionId = String(req.headers['x-session-id'] ?? '');
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) {
        return sendJson(res, 400, { error: 'x-session-id header is required (1-128 letters, digits, - or _)' });
      }
      const body = await readJson(req);
      const input = String(body.input ?? '');
      const checkpoint = await store.load(sessionId);
      checkpoint.messages.push({ role: 'user', content: input, at: new Date().toISOString() });
      const reply = await runTurn(checkpoint, input);
      checkpoint.messages.push({ role: 'agent', content: reply, at: new Date().toISOString() });
      await store.save(checkpoint);
      return sendJson(res, 200, { sessionId, reply, turns: checkpoint.messages.length / 2 });
    }

    if (url.pathname === '/session' && req.method === 'GET') {
      const sessionId = String(req.headers['x-session-id'] ?? '');
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) return sendJson(res, 400, { error: 'x-session-id header is required' });
      const checkpoint = await store.load(sessionId);
      return sendJson(res, 200, { sessionId, turns: checkpoint.messages.length / 2, messages: checkpoint.messages });
    }

    return sendJson(res, 404, { error: 'not_found' });
  } catch (error) {
    console.error('[agent] request failed:', error);
    return sendJson(res, 500, { error: 'internal_error' });
  }
});

// Bind beyond loopback: Traefik reaches the container over the Docker network.
server.listen(PORT, '0.0.0.0', () => {
  console.log('\\n🤖 ${name} agent on http://localhost:' + PORT + ' (durability: ' + DURABILITY + ')');
});

// Drain on SIGTERM (tdk down, hot reload, docker stop): stop taking turns, let in-flight turns finish, then exit 0.
// Checkpoints are written before a turn is answered, so a drained exit loses no acknowledged turn.
function shutdown(signal: string) {
  if (draining) return;
  draining = true;
  console.log('[agent] ' + signal + ' received, draining ' + inFlight + ' in-flight request(s)');
  server.close();
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  const timer = setInterval(() => {
    if (inFlight === 0 || Date.now() > deadline) {
      clearInterval(timer);
      process.exit(0);
    }
  }, 100);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
`;
}

export const customAgentRuntime: BackendFrameworkProvider = {
  id: "custom",
  label: "Custom agent runtime (Bun HTTP, no vendor dependency)",
  dependencies: {},
  devDependencies: {},
  createIndex: getCustomAgentIndexTemplate,
};
