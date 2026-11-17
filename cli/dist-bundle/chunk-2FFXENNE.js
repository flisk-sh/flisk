import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  BACKEND_LANGUAGES,
  LOCAL_FRONTEND_CORS_REASON,
  getBackendIndexTemplate,
  getBackendLanguage,
  localFrontendOriginConst,
  portFromEnv
} from "./chunk-2ZNKJUYM.js";
import {
  FliskError
} from "./chunk-73W4Y4TI.js";

// dist/agent-runtimes/custom.js
function getCustomAgentIndexTemplate(name, durability = "files", options = {}) {
  if (durability === "postgres") {
    return `import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Client } from 'pg';

// Contract with Flisk (see docs/agents/ai-agents.md):
//   AGENT_DURABILITY  postgres
//   DATABASE_URL      Postgres connection string injected by Flisk
//   AGENT_MAX_TURN_BODY_BYTES  max POST /turn body in bytes (default 1048576); over the limit: 413 payload_too_large
//   PORT              port to listen on
// /health: the process is alive. /ready: the checkpoint store is reachable. Idle is healthy, so /health never checks the store.

const DURABILITY = 'postgres';
${portFromEnv("PORT", "", options.port)}
const DRAIN_TIMEOUT_MS = 10_000;
// A checkpoint is kept until its session has been quiet this long, swept on this interval. Idle is healthy here and
// nothing else ever reaps a session, so without the sweep the checkpoint store grows for the life of the service.
// A malformed override falls back to the default: a NaN threshold would disable the sweep without saying so.
const SESSION_IDLE_TIMEOUT_MS = Number(process.env.SESSION_IDLE_TIMEOUT_MS) || 86_400_000;
const SESSION_CLEANUP_INTERVAL_MS = Number(process.env.SESSION_CLEANUP_INTERVAL_MS) || 3_600_000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

interface Checkpoint {
  sessionId: string;
  messages: Array<{ role: 'user' | 'agent'; content: string; at: string }>;
}

// One row of GET /sessions: what is stored, not what is in it, so listing never reads a whole conversation.
interface SessionSummary {
  sessionId: string;
  lastActivity: string;
  checkpointBytes: number;
}

let client: Client | null = null;
let initialized = false;

async function getClient(): Promise<Client> {
  if (client) return client;
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  if (!initialized) {
    await c.query(\`
      CREATE TABLE IF NOT EXISTS flisk_agent_sessions (
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
      const res = await c.query('SELECT messages FROM flisk_agent_sessions WHERE session_id = $1', [sessionId]);
      if (res.rows.length > 0 && res.rows[0].messages) {
        return { sessionId, messages: res.rows[0].messages };
      }
      return { sessionId, messages: [] };
    } catch (err) {
      console.error('[agent] load checkpoint failed:', err);
      return { sessionId, messages: [] };
    }
  },
  async list(): Promise<SessionSummary[]> {
    const c = await getClient();
    const res = await c.query(
      'SELECT session_id, updated_at, octet_length(messages::text) AS bytes FROM flisk_agent_sessions',
    );
    return res.rows.map((row: { session_id: string; updated_at: Date; bytes: number }) => ({
      sessionId: row.session_id,
      lastActivity: new Date(row.updated_at).toISOString(),
      checkpointBytes: Number(row.bytes),
    }));
  },
  async delete(sessionId: string): Promise<void> {
    try {
      const c = await getClient();
      await c.query('DELETE FROM flisk_agent_sessions WHERE session_id = $1', [sessionId]);
    } catch (err) {
      console.error('[agent] delete checkpoint failed:', err);
    }
  },
  async save(checkpoint: Checkpoint): Promise<void> {
    const c = await getClient();
    await c.query(
      \`INSERT INTO flisk_agent_sessions (session_id, messages, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (session_id) DO UPDATE
       SET messages = EXCLUDED.messages, updated_at = NOW()\`,
      [checkpoint.sessionId, JSON.stringify(checkpoint.messages)],
    );
  },
  async close(): Promise<void> {
    // Take the client first: drain can call close twice at once, and a second end() on one client throws.
    const c = client;
    client = null;
    if (c) {
      try {
        await c.end();
      } catch (err) {
        console.warn('[agent] closing the checkpoint client failed:', err);
      }
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
let sweepTimer: ReturnType<typeof setInterval> | null = null;
// Turns in flight per session, so GET /sessions can tell an active session from an idle one.
const activeTurns = new Map<string, number>();
// Per-session operation queues to serialize activeTurns updates and prevent race conditions.
const sessionOperationQueues = new Map<string, Promise<void>>();
const SESSION_LIST_LIMIT = 500;

// A session with a turn in flight is never swept however old its checkpoint looks: the turn is about to write that
// checkpoint again, and deleting it under the turn would drop the conversation the caller is still having.
async function sweepIdleSessions() {
  if (draining) return;
  try {
    const idleBefore = Date.now() - SESSION_IDLE_TIMEOUT_MS;
    let swept = 0;
    for (const session of await store.list()) {
      if (activeTurns.has(session.sessionId)) continue;
      if (new Date(session.lastActivity).getTime() >= idleBefore) continue;
      await store.delete(session.sessionId);
      swept++;
    }
    if (swept > 0) console.log('[agent] swept ' + swept + ' idle session(s)');
  } catch (err) {
    console.error('[agent] idle sweep failed:', err);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

// /turn request bodies are capped (default 1 MiB, see AGENT_MAX_TURN_BODY_BYTES) so one
// request cannot fill process memory or the checkpoint store. The limit is enforced while
// streaming: the body is never buffered past the limit.
const MAX_TURN_BODY_BYTES = Number(process.env.AGENT_MAX_TURN_BODY_BYTES) || 1_048_576;

class PayloadTooLargeError extends Error {
  constructor() {
    super('request body exceeds AGENT_MAX_TURN_BODY_BYTES');
    this.name = 'PayloadTooLargeError';
  }
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += (chunk as Buffer).length;
    if (totalBytes > MAX_TURN_BODY_BYTES) {
      // Stop the client sending more: pause the stream, answer 413, then close the connection.
      req.pause();
      throw new PayloadTooLargeError();
    }
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function queueSessionOperation(sessionId: string, operation: () => Promise<void>): Promise<void> {
  const currentQueue = sessionOperationQueues.get(sessionId) ?? Promise.resolve();
  // Hand the caller the operation's own promise so a failed turn reaches the handler's catch and answers 500; the stored
  // tail never rejects, so the next operation for this session still runs.
  const run = currentQueue.then(operation);
  sessionOperationQueues.set(sessionId, run.catch(() => {}));
  return run;
}

const server = createServer(async (req, res) => {
  inFlight++;
  res.on('close', () => inFlight--);
  let url: URL;
  try {
    url = new URL(req.url ?? '/', 'http://localhost');
  } catch {
    return sendJson(res, 400, { error: 'bad_request' });
  }

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
      let body: any;
      try {
        body = await readJson(req);
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          // The request stream is paused; answer 413, then close the connection so the
          // client stops sending the rest of the body. Nothing is written to the checkpoint.
          res.setHeader('connection', 'close');
          sendJson(res, 413, { error: 'payload_too_large' });
          res.on('finish', () => req.destroy());
          return;
        }
        if (!(error instanceof SyntaxError)) throw error;
        return sendJson(res, 400, { error: 'invalid_json' });
      }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return sendJson(res, 400, { error: 'invalid_json' });
      }
      // Only "input" is read: answer 400 instead of running a turn on an empty prompt when a client sends another field.
      if (typeof body.input !== 'string' || body.input.length === 0) {
        return sendJson(res, 400, { error: 'input_required', hint: 'send {"input": "..."}' });
      }
      const input: string = body.input;
      // Queue the turn operation per-session to serialize activeTurns updates and prevent race conditions
      return await queueSessionOperation(sessionId, async () => {
        activeTurns.set(sessionId, (activeTurns.get(sessionId) ?? 0) + 1);
        try {
          const checkpoint = await store.load(sessionId);
          checkpoint.messages.push({ role: 'user', content: input, at: new Date().toISOString() });
          const reply = await runTurn(checkpoint, input);
          checkpoint.messages.push({ role: 'agent', content: reply, at: new Date().toISOString() });
          await store.save(checkpoint);
          return sendJson(res, 200, { sessionId, reply, turns: checkpoint.messages.length / 2 });
        } finally {
          const left = (activeTurns.get(sessionId) ?? 1) - 1;
          if (left > 0) activeTurns.set(sessionId, left);
          else activeTurns.delete(sessionId);
        }
      });
    }

    if (url.pathname === '/session' && req.method === 'GET') {
      const sessionId = String(req.headers['x-session-id'] ?? '');
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) return sendJson(res, 400, { error: 'x-session-id header is required' });
      const checkpoint = await store.load(sessionId);
      return sendJson(res, 200, { sessionId, turns: checkpoint.messages.length / 2, messages: checkpoint.messages });
    }

    if (url.pathname === '/session' && req.method === 'DELETE') {
      const sessionId = String(req.headers['x-session-id'] ?? '');
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) return sendJson(res, 400, { error: 'x-session-id header is required' });
      if (activeTurns.has(sessionId)) return sendJson(res, 409, { error: 'turn_in_flight' });
      await store.delete(sessionId);
      return sendJson(res, 200, { deleted: sessionId });
    }

    // Read-only list of the stored sessions, most recent first. status is 'active' while this instance runs a turn
    // for the session, otherwise 'idle'. total counts every stored session, also those past the limit.
    if (url.pathname === '/sessions' && req.method === 'GET') {
      const all = (await store.list()).sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
      const sessions = all.slice(0, SESSION_LIST_LIMIT).map((s) => ({
        ...s,
        status: activeTurns.has(s.sessionId) ? 'active' : 'idle',
      }));
      return sendJson(res, 200, { sessions, total: all.length });
    }

    return sendJson(res, 404, { error: 'not_found' });
  } catch (error) {
    console.error('[agent] request failed:', error);
    return sendJson(res, 500, { error: 'internal_error' });
  }
});

// Bind beyond loopback: Traefik reaches the container over the Docker network.
server.listen(PORT, '0.0.0.0', () => {
  console.log('\\n\u{1F916} ${name} agent on http://localhost:' + PORT + ' (durability: ' + DURABILITY + ')');
  // unref: a scheduled sweep must never be the reason the process stays alive.
  sweepTimer = setInterval(() => sweepIdleSessions(), SESSION_CLEANUP_INTERVAL_MS);
  sweepTimer.unref();
});

// Drain on SIGTERM (flisk down, hot reload, docker stop): stop taking turns, let in-flight turns finish, then exit 0.
// Checkpoints are written before a turn is answered, so a drained exit loses no acknowledged turn.
function shutdown(signal: string) {
  if (draining) return;
  draining = true;
  if (sweepTimer) clearInterval(sweepTimer);
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
import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Contract with Flisk (see docs/agents/ai-agents.md):
//   AGENT_DURABILITY  files   (set by flisk from service.json agent.durability)
//   AGENT_STATE_DIR   where files-durability checkpoints live (a named volume that survives flisk down)
//   AGENT_MAX_TURN_BODY_BYTES  max POST /turn body in bytes (default 1048576); over the limit: 413 payload_too_large
//   PORT              port to listen on
// /health: the process is alive. /ready: the checkpoint store is reachable. Idle is healthy, so /health never checks the store.

const DURABILITY = 'files';
const STATE_DIR = process.env.AGENT_STATE_DIR || join(process.cwd(), '.agent-state');
${portFromEnv("PORT", "", options.port)}
const DRAIN_TIMEOUT_MS = 10_000;
// A checkpoint is kept until its session has been quiet this long, swept on this interval. Idle is healthy here and
// nothing else ever reaps a session, so without the sweep the checkpoint store grows for the life of the service.
// A malformed override falls back to the default: a NaN threshold would disable the sweep without saying so.
const SESSION_IDLE_TIMEOUT_MS = Number(process.env.SESSION_IDLE_TIMEOUT_MS) || 86_400_000;
const SESSION_CLEANUP_INTERVAL_MS = Number(process.env.SESSION_CLEANUP_INTERVAL_MS) || 3_600_000;

interface Checkpoint {
  sessionId: string;
  messages: Array<{ role: 'user' | 'agent'; content: string; at: string }>;
}

// One row of GET /sessions: what is stored, not what is in it, so listing never reads a whole conversation.
interface SessionSummary {
  sessionId: string;
  lastActivity: string;
  checkpointBytes: number;
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
  list(): SessionSummary[] {
    if (!existsSync(STATE_DIR)) return [];
    // Only finished checkpoints: an in-progress write is still a .tmp file.
    return readdirSync(STATE_DIR)
      .filter((file) => file.endsWith('.json'))
      .flatMap((file) => {
        try {
          const stat = statSync(join(STATE_DIR, file));
          return [{ sessionId: file.slice(0, -'.json'.length), lastActivity: stat.mtime.toISOString(), checkpointBytes: stat.size }];
        } catch {
          return []; // removed between the directory read and the stat
        }
      });
  },
  save(checkpoint: Checkpoint): void {
    mkdirSync(STATE_DIR, { recursive: true });
    const file = join(STATE_DIR, checkpoint.sessionId + '.json');
    const tmp = file + '.' + process.pid + '.tmp';
    writeFileSync(tmp, JSON.stringify(checkpoint));
    renameSync(tmp, file);
  },
  delete(sessionId: string): void {
    try {
      unlinkSync(join(STATE_DIR, sessionId + '.json'));
    } catch (err) {
      // Already gone is the goal state, so only a real failure is worth a line.
      if ((err as { code?: string }).code !== 'ENOENT') console.error('[agent] delete checkpoint failed:', err);
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
let sweepTimer: ReturnType<typeof setInterval> | null = null;
// Turns in flight per session, so GET /sessions can tell an active session from an idle one.
const activeTurns = new Map<string, number>();
// Per-session operation queues to serialize activeTurns updates and prevent race conditions.
const sessionOperationQueues = new Map<string, Promise<void>>();
const SESSION_LIST_LIMIT = 500;

// A session with a turn in flight is never swept however old its checkpoint looks: the turn is about to write that
// checkpoint again, and deleting it under the turn would drop the conversation the caller is still having.
async function sweepIdleSessions() {
  if (draining) return;
  try {
    const idleBefore = Date.now() - SESSION_IDLE_TIMEOUT_MS;
    let swept = 0;
    for (const session of await store.list()) {
      if (activeTurns.has(session.sessionId)) continue;
      if (new Date(session.lastActivity).getTime() >= idleBefore) continue;
      await store.delete(session.sessionId);
      swept++;
    }
    if (swept > 0) console.log('[agent] swept ' + swept + ' idle session(s)');
  } catch (err) {
    console.error('[agent] idle sweep failed:', err);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

// /turn request bodies are capped (default 1 MiB, see AGENT_MAX_TURN_BODY_BYTES) so one
// request cannot fill process memory or the checkpoint store. The limit is enforced while
// streaming: the body is never buffered past the limit.
const MAX_TURN_BODY_BYTES = Number(process.env.AGENT_MAX_TURN_BODY_BYTES) || 1_048_576;

class PayloadTooLargeError extends Error {
  constructor() {
    super('request body exceeds AGENT_MAX_TURN_BODY_BYTES');
    this.name = 'PayloadTooLargeError';
  }
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += (chunk as Buffer).length;
    if (totalBytes > MAX_TURN_BODY_BYTES) {
      // Stop the client sending more: pause the stream, answer 413, then close the connection.
      req.pause();
      throw new PayloadTooLargeError();
    }
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function queueSessionOperation(sessionId: string, operation: () => Promise<void>): Promise<void> {
  const currentQueue = sessionOperationQueues.get(sessionId) ?? Promise.resolve();
  // Hand the caller the operation's own promise so a failed turn reaches the handler's catch and answers 500; the stored
  // tail never rejects, so the next operation for this session still runs.
  const run = currentQueue.then(operation);
  sessionOperationQueues.set(sessionId, run.catch(() => {}));
  return run;
}

const server = createServer(async (req, res) => {
  inFlight++;
  res.on('close', () => inFlight--);
  let url: URL;
  try {
    url = new URL(req.url ?? '/', 'http://localhost');
  } catch {
    return sendJson(res, 400, { error: 'bad_request' });
  }

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
      let body: any;
      try {
        body = await readJson(req);
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          // The request stream is paused; answer 413, then close the connection so the
          // client stops sending the rest of the body. Nothing is written to the checkpoint.
          res.setHeader('connection', 'close');
          sendJson(res, 413, { error: 'payload_too_large' });
          res.on('finish', () => req.destroy());
          return;
        }
        if (!(error instanceof SyntaxError)) throw error;
        return sendJson(res, 400, { error: 'invalid_json' });
      }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return sendJson(res, 400, { error: 'invalid_json' });
      }
      // Only "input" is read: answer 400 instead of running a turn on an empty prompt when a client sends another field.
      if (typeof body.input !== 'string' || body.input.length === 0) {
        return sendJson(res, 400, { error: 'input_required', hint: 'send {"input": "..."}' });
      }
      const input: string = body.input;
      // Queue the turn operation per-session to serialize activeTurns updates and prevent race conditions
      return await queueSessionOperation(sessionId, async () => {
        activeTurns.set(sessionId, (activeTurns.get(sessionId) ?? 0) + 1);
        try {
          const checkpoint = await store.load(sessionId);
          checkpoint.messages.push({ role: 'user', content: input, at: new Date().toISOString() });
          const reply = await runTurn(checkpoint, input);
          checkpoint.messages.push({ role: 'agent', content: reply, at: new Date().toISOString() });
          await store.save(checkpoint);
          return sendJson(res, 200, { sessionId, reply, turns: checkpoint.messages.length / 2 });
        } finally {
          const left = (activeTurns.get(sessionId) ?? 1) - 1;
          if (left > 0) activeTurns.set(sessionId, left);
          else activeTurns.delete(sessionId);
        }
      });
    }

    if (url.pathname === '/session' && req.method === 'GET') {
      const sessionId = String(req.headers['x-session-id'] ?? '');
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) return sendJson(res, 400, { error: 'x-session-id header is required' });
      const checkpoint = await store.load(sessionId);
      return sendJson(res, 200, { sessionId, turns: checkpoint.messages.length / 2, messages: checkpoint.messages });
    }

    if (url.pathname === '/session' && req.method === 'DELETE') {
      const sessionId = String(req.headers['x-session-id'] ?? '');
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) return sendJson(res, 400, { error: 'x-session-id header is required' });
      if (activeTurns.has(sessionId)) return sendJson(res, 409, { error: 'turn_in_flight' });
      await store.delete(sessionId);
      return sendJson(res, 200, { deleted: sessionId });
    }

    // Read-only list of the stored sessions, most recent first. status is 'active' while this instance runs a turn
    // for the session, otherwise 'idle'. total counts every stored session, also those past the limit.
    if (url.pathname === '/sessions' && req.method === 'GET') {
      const all = (await store.list()).sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
      const sessions = all.slice(0, SESSION_LIST_LIMIT).map((s) => ({
        ...s,
        status: activeTurns.has(s.sessionId) ? 'active' : 'idle',
      }));
      return sendJson(res, 200, { sessions, total: all.length });
    }

    return sendJson(res, 404, { error: 'not_found' });
  } catch (error) {
    console.error('[agent] request failed:', error);
    return sendJson(res, 500, { error: 'internal_error' });
  }
});

// Bind beyond loopback: Traefik reaches the container over the Docker network.
server.listen(PORT, '0.0.0.0', () => {
  console.log('\\n\u{1F916} ${name} agent on http://localhost:' + PORT + ' (durability: ' + DURABILITY + ')');
  // unref: a scheduled sweep must never be the reason the process stays alive.
  sweepTimer = setInterval(() => sweepIdleSessions(), SESSION_CLEANUP_INTERVAL_MS);
  sweepTimer.unref();
});

// Drain on SIGTERM (flisk down, hot reload, docker stop): stop taking turns, let in-flight turns finish, then exit 0.
// Checkpoints are written before a turn is answered, so a drained exit loses no acknowledged turn.
function shutdown(signal: string) {
  if (draining) return;
  draining = true;
  if (sweepTimer) clearInterval(sweepTimer);
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
var customAgentRuntime = {
  id: "custom",
  label: "Custom agent runtime (Bun HTTP, no vendor dependency)",
  dependencies: {},
  devDependencies: {},
  createIndex: getCustomAgentIndexTemplate
};

// dist/agent-runtimes/registry.js
var AGENT_RUNTIMES = {
  custom: customAgentRuntime
};
var DEFAULT_AGENT_RUNTIME = "custom";
var AGENT_DURABILITY_OPTIONS = ["files", "postgres"];
function resolveAgentRuntime(runtimeId) {
  const id = runtimeId ?? DEFAULT_AGENT_RUNTIME;
  const provider = AGENT_RUNTIMES[id];
  if (!provider) {
    const supported = Object.keys(AGENT_RUNTIMES).join(", ");
    throw new FliskError(`Unknown agent runtime "${id}". Supported runtimes: ${supported}.`, [
      `Use one of: ${supported}`,
      `Omit --runtime to use ${DEFAULT_AGENT_RUNTIME}`
    ]);
  }
  return provider;
}
function resolveAgentDurability(value) {
  const durability = value ?? "files";
  if (!AGENT_DURABILITY_OPTIONS.includes(durability)) {
    throw new FliskError(`Unknown --durability "${durability}".`, [
      `Use one of: ${AGENT_DURABILITY_OPTIONS.join(", ")}`
    ]);
  }
  return durability;
}

// dist/generator/resource-templates.js
function getDockerfileTemplate(port, healthCheckPath) {
  const healthcheck = healthCheckPath ? `# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \\
  CMD bun -e "fetch('http://localhost:${port}${healthCheckPath}').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

` : "";
  return `# Scaffolded by \`flisk resource\`. \`flisk up\` does NOT build this file: it builds
# .autogenerated/Dockerfile.app.autogenerated (golden layers, project root as context).
# Use this one as a starting point for building the image outside Flisk, and keep its
# port in step with "port" in service.json.
FROM oven/bun:1.3

WORKDIR /app

# Copy package files (bun.lock is optional: a Flisk workspace keeps it at the project root)
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install

# Copy source
COPY . .

# Build if needed
RUN bun run build

${healthcheck}ENV PORT=${port}
EXPOSE ${port}

CMD ["bun", "run", "start"]
`;
}
function getShutdownHandlerTemplate(signal) {
  return `process.on('${signal}', () => {
  console.log('[Worker] ${signal} received, shutting down gracefully...');
  process.exit(0);
});`;
}
function getWorkerIndexTemplate(name) {
  return `console.log('\u{1F680} ${name} worker started');

interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  priority?: number;
  timestamp?: string;
}

const CONFIG = {
  pollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL || '5000'),
  maxRetries: parseInt(process.env.WORKER_MAX_RETRIES || '3'),
  batchSize: parseInt(process.env.WORKER_BATCH_SIZE || '10'),
};

async function processJob(job: Job): Promise<void> {
  console.log('[Worker] Processing job:', job.id, 'type:', job.type);

  // Add job processing logic here using job.payload

  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('[Worker] Job completed:', job.id);
}

let demoJobSent = false;

async function fetchJobs(): Promise<Job[]> {
  // Connect to your queue (Redis, RabbitMQ, etc.) and fetch jobs.
  // Until you do, hand out one demo job on the first poll so the loop runs end to end; remove this with the queue.
  if (demoJobSent) return [];
  demoJobSent = true;
  return [{ id: 'demo-1', type: 'demo', payload: {} }];
}

async function main() {
  console.log('[Worker] Configuration:', CONFIG);

  while (true) {
    try {
      const jobs = await fetchJobs();

      if (jobs.length === 0) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.pollIntervalMs));
        continue;
      }

      console.log(\`[Worker] Fetched \${jobs.length} jobs\`);

      for (const job of jobs) {
        try {
          await processJob(job);
        } catch (error: unknown) {
          console.error('[Worker] Job failed:', error);
        }
      }
    } catch (error: unknown) {
      console.error('[Worker] Error in main loop:', error);
      // Wait before retrying to avoid tight error loops
      await new Promise(resolve => setTimeout(resolve, CONFIG.pollIntervalMs));
    }
  }
}

${getShutdownHandlerTemplate("SIGTERM")}

${getShutdownHandlerTemplate("SIGINT")}

main().catch((err) => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});
`;
}
function getTestTemplate(name) {
  return `import { describe, it } from 'vitest';

describe('${name}', () => {
  it.todo('add a real test for ${name}');
});
`;
}
function getBackendTestTemplate(name) {
  return `import { describe, expect, it } from 'vitest';
import server from '../src/index.js';

describe('${name}', () => {
  it('answers the health check', async () => {
    const response = await server.fetch(new Request('http://localhost/health'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', service: '${name}' });
  });
});
`;
}

// dist/backend-frameworks/elysia.js
function getElysiaIndexTemplate(name, _durability, options = {}) {
  return `import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';

${portFromEnv("port", "", options.port)}

// ${LOCAL_FRONTEND_CORS_REASON}
${localFrontendOriginConst()}

const app = new Elysia()
  .use(cors({ origin: LOCAL_FRONTEND_ORIGIN }))
  // Health check: Flisk uses this endpoint to check service health
  .get('/health', () => ({ status: 'ok', service: '${name}' }))
  .get('/health/live', () => ({ status: 'alive', timestamp: Date.now() }))
  .get('/health/ready', ({ set }) => {
    const dependencies: Record<string, string> = {};
    let allReady = true;

    // Add dependency checks here (database, cache, etc.)
    // Mark allReady = false if any dependency is unhealthy

    set.status = allReady ? 200 : 503;
    return { status: allReady ? 'ready' : 'not_ready', dependencies };
  })
  .get('/', () => ({
    service: '${name}',
    version: '1.0.0',
    endpoints: ['/health', '/health/live', '/health/ready']
  }))
  // Bind beyond loopback: Traefik reaches the container over the Docker network.
  .listen({ port, hostname: '0.0.0.0' });

console.log('\\n\u{1F680} ${name} running on http://localhost:' + app.server?.port);
console.log('\u{1F4CA} Health check: http://localhost:' + app.server?.port + '/health\\n');
`;
}
var elysiaBackendProvider = {
  id: "elysia",
  label: "Bun + Elysia",
  dependencies: { "@elysiajs/cors": "^1.4.0", elysia: "^1.4.0" },
  devDependencies: {},
  createIndex: getElysiaIndexTemplate
};

// dist/backend-frameworks/express.js
function getExpressIndexTemplate(name, _durability, options = {}) {
  return `import express from 'express';

const app = express();

// ${LOCAL_FRONTEND_CORS_REASON}
${localFrontendOriginConst()}
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && LOCAL_FRONTEND_ORIGIN.test(origin)) {
    res.vary('Origin');
    res.set('Access-Control-Allow-Origin', origin);
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, HEAD, PUT, POST, DELETE, PATCH');
      res.set('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] ?? '');
      res.sendStatus(204);
      return;
    }
  }
  next();
});

// Health check: Flisk uses this endpoint to check service health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: '${name}' });
});

app.get('/health/live', (_req, res) => {
  res.json({ status: 'alive', timestamp: Date.now() });
});

app.get('/health/ready', async (_req, res) => {
  const dependencies: Record<string, string> = {};
  let allReady = true;

  // Add dependency checks here (database, cache, etc.)
  // Mark allReady = false if any dependency is unhealthy

  const status = allReady ? 'ready' : 'not_ready';
  res.status(allReady ? 200 : 503).json({ status, dependencies });
});

app.get('/', (_req, res) => {
  res.json({
    service: '${name}',
    version: '1.0.0',
    endpoints: ['/health', '/health/live', '/health/ready']
  });
});

${portFromEnv("port", "", options.port)}

// Bind beyond loopback: Traefik reaches the container over the Docker network.
app.listen(port, '0.0.0.0', () => {
  console.log('\\n\u{1F680} ${name} running on http://localhost:' + port);
  console.log('\u{1F4CA} Health check: http://localhost:' + port + '/health\\n');
});
`;
}
var expressBackendProvider = {
  id: "express",
  label: "Bun + Express",
  dependencies: { express: "^5.1.0" },
  devDependencies: { "@types/express": "^5.0.0" },
  createIndex: getExpressIndexTemplate
};

// dist/backend-frameworks/fastify.js
function getFastifyIndexTemplate(name, _durability, options = {}) {
  return `import cors from '@fastify/cors';
import Fastify from 'fastify';

const app = Fastify();

// ${LOCAL_FRONTEND_CORS_REASON}
${localFrontendOriginConst()}
await app.register(cors, {
  origin: LOCAL_FRONTEND_ORIGIN,
  methods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH']
});

// Health check: Flisk uses this endpoint to check service health
app.get('/health', async () => ({ status: 'ok', service: '${name}' }));

app.get('/health/live', async () => ({ status: 'alive', timestamp: Date.now() }));

app.get('/health/ready', async (_request, reply) => {
  const dependencies: Record<string, string> = {};
  let allReady = true;

  // Add dependency checks here (database, cache, etc.)
  // Mark allReady = false if any dependency is unhealthy

  const status = allReady ? 'ready' : 'not_ready';
  return reply.code(allReady ? 200 : 503).send({ status, dependencies });
});

app.get('/', async () => ({
  service: '${name}',
  version: '1.0.0',
  endpoints: ['/health', '/health/live', '/health/ready']
}));

${portFromEnv("port", "", options.port)}

// Bind beyond loopback: Traefik reaches the container over the Docker network.
await app.listen({ port, host: '0.0.0.0' });

console.log('\\n\u{1F680} ${name} running on http://localhost:' + port);
console.log('\u{1F4CA} Health check: http://localhost:' + port + '/health\\n');
`;
}
var fastifyBackendProvider = {
  id: "fastify",
  label: "Bun + Fastify",
  dependencies: { "@fastify/cors": "^11.0.0", fastify: "^5.0.0" },
  devDependencies: {},
  createIndex: getFastifyIndexTemplate
};

// dist/backend-frameworks/h3.js
function getH3IndexTemplate(name, _durability, options = {}) {
  return `import { createServer } from 'node:http';
import { createApp, createRouter, defineEventHandler, handleCors, toNodeListener } from 'h3';

const app = createApp();
const router = createRouter();

// ${LOCAL_FRONTEND_CORS_REASON}
${localFrontendOriginConst()}
app.use(defineEventHandler((event) => {
  if (handleCors(event, { origin: [LOCAL_FRONTEND_ORIGIN], methods: '*', preflight: { statusCode: 204 } })) {
    return null;
  }
}));

// Health check: Flisk uses this endpoint to check service health
router.get('/health', defineEventHandler(() => ({ status: 'ok', service: '${name}' })));

router.get('/health/live', defineEventHandler(() => ({ status: 'alive', timestamp: Date.now() })));

router.get('/', defineEventHandler(() => ({
  service: '${name}',
  version: '1.0.0',
  endpoints: ['/health', '/health/live']
})));

app.use(router);

${portFromEnv("port", "", options.port)}

// node:http works on Bun. Bind beyond loopback: Traefik reaches the container over the Docker network.
createServer(toNodeListener(app)).listen(port, '0.0.0.0', () => {
  console.log('\\n\u{1F680} ${name} running on http://localhost:' + port);
  console.log('\u{1F4CA} Health check: http://localhost:' + port + '/health\\n');
});
`;
}
var h3BackendProvider = {
  id: "h3",
  label: "Bun + h3",
  // h3's npm "latest" tag is a 2.0 release candidate; the scaffold stays on the stable 1.x line.
  dependencies: { h3: "^1.15.0" },
  devDependencies: {},
  createIndex: getH3IndexTemplate
};

// dist/backend-frameworks/koa.js
function getKoaIndexTemplate(name, _durability, options = {}) {
  return `import Koa from 'koa';

const app = new Koa();

// ${LOCAL_FRONTEND_CORS_REASON}
${localFrontendOriginConst()}
app.use(async (ctx, next) => {
  const origin = ctx.get('Origin');
  if (LOCAL_FRONTEND_ORIGIN.test(origin)) {
    ctx.vary('Origin');
    ctx.set('Access-Control-Allow-Origin', origin);
    if (ctx.method === 'OPTIONS') {
      ctx.set('Access-Control-Allow-Methods', 'GET, HEAD, PUT, POST, DELETE, PATCH');
      ctx.set('Access-Control-Allow-Headers', ctx.get('Access-Control-Request-Headers'));
      ctx.status = 204;
      return;
    }
  }
  await next();
});

// Plain Koa middleware, so the scaffold needs no router dependency.
app.use(async (ctx) => {
  // Health check: Flisk uses this endpoint to check service health
  if (ctx.path === '/health') {
    ctx.body = { status: 'ok', service: '${name}' };
    return;
  }

  if (ctx.path === '/health/live') {
    ctx.body = { status: 'alive', timestamp: Date.now() };
    return;
  }

  if (ctx.path === '/') {
    ctx.body = {
      service: '${name}',
      version: '1.0.0',
      endpoints: ['/health', '/health/live']
    };
    return;
  }

  ctx.status = 404;
  ctx.body = { error: 'not_found' };
});

${portFromEnv("port", "", options.port)}

// Bind beyond loopback: Traefik reaches the container over the Docker network.
app.listen(port, '0.0.0.0', () => {
  console.log('\\n\u{1F680} ${name} running on http://localhost:' + port);
  console.log('\u{1F4CA} Health check: http://localhost:' + port + '/health\\n');
});
`;
}
var koaBackendProvider = {
  id: "koa",
  label: "Bun + Koa",
  dependencies: { koa: "^3.0.0" },
  devDependencies: { "@types/koa": "^3.0.0" },
  createIndex: getKoaIndexTemplate
};

// dist/backend-frameworks/mcp.js
var MCP_ICON_512_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAMAAADDpiTIAAAABlBMVEUWo0r///+zeCNEAAAFKklEQVR42u3c0XEYORDEUE7+SSsCfam4IomHCDgNeFW+s70WAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgB7zK7ZJapcC9TLgXgXcq4B8EZAvAvY1wL4G2NcA+xqgXwLsa4B+CbCvAfolQL8E6JcA/RKgXwL0S4B+CdAvAf4VQL8E6JcA/wqgXwL8K4B+CfCvAPolwL8C+FdAXL8E+FdA3b8C4volwL8C6v4VUPevgLp/BdT9KyCuXwL8K6DuXwF1/wqo+1dA3b8C6v4V8L/+z30D/weMroAX/T/wJP4/H1oB1/t//XX8f7GvAm70X3ylAHbuKoBr/Htr2b/3pv17ctq/V6f9e3jav7enA/D6tH8HpP27gX9XZANwR9q/U/h3TNa/e9oBOIh/J2X9u6odgLP4dxj/TksG4Dj+nce/A5sBuJB/N3YDcCT/zuTfoc0AXMq/W7sBOJZ/53YDcC//Lu4G4GQfADf7ADiaf2cHl3A3/y4XgMut4PbgCI7n3/kWcH50Afe73wLOt4DrbeB4G9SOX0sB43QFuFwADleAuw2RunstBaT/d7gAXpmC//gWAmhvwX98DQEIgP/wHD4A8T34jw8igPYg/McnEYAABCAA/qub+ADER+E/vooABCCA8Cr8x3cRgAAEIAD+s8MIoD2MnwDxZfiPTyMAAQhAAAKoTsN/fBwBCEAAAhCAAAQgAP576/gAxOcRgAAEIAABCID/5j4CEIAABCAAAQhAAALo7eN3gfGBBCAA/ssLCUAAAhCAAAQgAAEIQAACEIAABCAAAQhAAAIQgAAEIAABCEAAAhCAAAQgAAEIQAACEIAABCAAAQjAHwvnXwACqP3VIAH4u4ECEIAABCAAAQhAAALwz8TxLwABCEAAAhDAFP65cAE8tY5PQHwcAQhAAAIQgAAEEB1HAfFpBCAAAQhAAAJQQHQZAcSHEYAAFFDeRQACEEB6FwXEVxGAAAQgAAV0RxFAfBOfgPgkAhCAANKTKCA+iAAEoID0HgKIz+ETEF9DAPU1FBDfQgACUEB6CgHEl/AJiA8hgPoQCojPIID6DAqIjzAKaG8ggPoGCogvIID6Au6P/woYPwIFIAA/A/13kOxvgyY8wgggvQL/AhBAeAf+/zzEOFsBjk4HMG72CXCyT4CLFeDeagDjXAU4Nh3AuFUBLk0HMA5VgDMV4MhwAONGBbgwHcA4UAHOU4DjwgGcu9LDp5mJf0Pxf85S46p6AeMkBTgoHcC4p17AOEYBTmkXMO6IB/C/071xhe34v3u9cUC9gPH6eABfj3jz218tYDy8XsB4db2A8eR6AeO99QL2bXrTW9sFTPqhAtgw7R2vVMCedc9/oQL2LXz26xSwdeZjH6aA7WMf+CQFfDT5UY9RwHfbn/AGBVRgvF0A3+0C2G4XwHW7AKbbBfDcLoDldAIMtwvgt10Au+0CuG0XwGy7AF7TCXDaLoDRdgF8phPgsl0Ak+0CeEwnwGG7AAbTCbDXLoC7dAK8tQtgLZ0AY+kE2GoXwFU6AZ7SCXCUToCfdALcpBPgJZ0AJ+kE+EgnwEW5ARbSCTBQbsD26QTsXm7A4uUGbF1uwMrlBuwbjsCu4Qjs2a3Ait0KbJfNwF7JFGwDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABPkB9z6yDZK057cAAAAASUVORK5CYII=";
function getMcpIndexTemplate(name, _durability, options = {}) {
  return `import { realpathSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

// The icon MCP directories and clients show next to this server's name. Replace it with your own 512 x 512 PNG.
const ICON_512_PNG = Buffer.from(
  '${MCP_ICON_512_PNG_BASE64}',
  'base64'
);

// A new McpServer per request keeps the endpoint stateless, so there is no session to lose when the container restarts.
function buildServer() {
  const server = new McpServer({
    name: '${name}',
    version: '1.0.0',
    // Clients and directories fetch this icon from the server's own origin.
    icons: [{ src: '/icon-512.png', mimeType: 'image/png', sizes: ['512x512'] }],
  });

  // Add your tools, resources and prompts here. These two are placeholders you can delete.
  server.registerTool(
    'echo',
    {
      title: 'Echo',
      description: 'Echo a message back',
      inputSchema: { message: z.string() },
      // Hints for clients: this tool only reads, deletes nothing, answers the same input the same way and reaches nothing outside this server.
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ message }) => ({ content: [{ type: 'text', text: message }] })
  );

  server.registerPrompt(
    'echo_message',
    {
      title: 'Echo a message',
      description: 'Ask the assistant to send a message through the echo tool',
      argsSchema: { message: z.string() },
    },
    ({ message }) => ({
      messages: [
        { role: 'user', content: { type: 'text', text: 'Call the echo tool with this message: ' + message } },
      ],
    })
  );

  return server;
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : undefined;
}

export const httpServer = createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0];

  // Health check: Flisk uses this endpoint to check service health
  if (path === '/health') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ status: 'ok', service: '${name}' }));
    return;
  }

  if (path === '/icon-512.png') {
    res.setHeader('content-type', 'image/png');
    res.setHeader('cache-control', 'public, max-age=86400');
    res.end(ICON_512_PNG);
    return;
  }

  // MCP over Streamable HTTP. Clients POST JSON-RPC here.
  if (path === '/mcp') {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('allow', 'POST');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null }));
      return;
    }

    // A body that is not JSON gets a JSON-RPC parse error. Throwing here would end the process, since nothing awaits
    // this handler.
    let body: unknown;
    try {
      body = await readBody(req);
    } catch {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }));
      return;
    }

    // A client that accepts only application/json gets a plain JSON response. The SDK refuses with 406 unless Accept also
    // lists text/event-stream, so add it to both header copies (the transport reads rawHeaders) and turn SSE off.
    const accept = String(req.headers.accept ?? '');
    const jsonOnly = accept.includes('application/json') && !accept.includes('text/event-stream');
    if (jsonOnly) {
      const widened = accept + ', text/event-stream';
      req.headers.accept = widened;
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        if (req.rawHeaders[i].toLowerCase() === 'accept') req.rawHeaders[i + 1] = widened;
      }
    }

    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: jsonOnly });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
    return;
  }

  res.statusCode = 404;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ error: 'not_found' }));
});

${portFromEnv("port", "", options.port)}

// Listen only when this file is the entry point (node dist/index.js, tsx src/index.ts). The protocol test imports it
// and listens on a port of its own.
function isEntryPoint() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  // Bind beyond loopback: Traefik reaches the container over the Docker network.
  httpServer.listen(port, '0.0.0.0', () => {
    console.log('\\n\u{1F680} ${name} MCP server on http://localhost:' + port + '/mcp');
    console.log('\u{1F4CA} Health check: http://localhost:' + port + '/health\\n');
  });
} else {
  console.log('${name}: imported as a module, not listening (run this file directly to start the server)');
}
`;
}
function getMcpTestTemplate(name) {
  return `import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { httpServer } from '../src/index';

let baseUrl = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  baseUrl = 'http://127.0.0.1:' + (httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  httpServer.closeAllConnections();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

let nextId = 1;

// Sends one JSON-RPC request to /mcp and returns its result. The transport answers with a server-sent event whose data line
// is the JSON-RPC response.
async function rpc(method: string, params: Record<string, unknown> = {}) {
  const res = await fetch(baseUrl + '/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  expect(res.status).toBe(200);
  const text = await res.text();
  const data = text.split('\\n').find((line) => line.startsWith('data: '));
  const message = JSON.parse(data ? data.slice('data: '.length) : text);
  expect(message.error).toBeUndefined();
  return message.result;
}

describe('${name} MCP protocol', () => {
  it('answers initialize with its name and the tools and prompts capabilities', async () => {
    const result = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'protocol-test', version: '1.0.0' },
    });
    expect(result.serverInfo.name).toBe('${name}');
    expect(result.serverInfo.icons).toEqual([{ src: '/icon-512.png', mimeType: 'image/png', sizes: ['512x512'] }]);
    expect(result.capabilities.tools).toBeDefined();
    expect(result.capabilities.prompts).toBeDefined();
  });

  it('lists the echo tool with its annotations', async () => {
    const { tools } = await rpc('tools/list');
    const echo = tools.find((tool: { name: string }) => tool.name === 'echo');
    expect(echo).toBeDefined();
    expect(echo.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  it('lists the echo_message prompt', async () => {
    const { prompts } = await rpc('prompts/list');
    expect(prompts.map((prompt: { name: string }) => prompt.name)).toContain('echo_message');
  });

  it('calls the echo tool', async () => {
    const result = await rpc('tools/call', { name: 'echo', arguments: { message: 'hello' } });
    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('answers a body that is not JSON with a parse error and keeps serving', async () => {
    const res = await fetch(baseUrl + '/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32700);
    expect((await fetch(baseUrl + '/health')).status).toBe(200);
  });

  it('answers a client that accepts only JSON with a JSON response', async () => {
    const res = await fetch(baseUrl + '/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method: 'tools/list', params: {} }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const message = await res.json();
    expect(message.result.tools.map((tool: { name: string }) => tool.name)).toContain('echo');
  });

  it('answers GET /mcp with 405 and an Allow header', async () => {
    const res = await fetch(baseUrl + '/mcp');
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('serves its icon as a PNG', async () => {
    const res = await fetch(baseUrl + '/icon-512.png');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
`;
}
var mcpBackendProvider = {
  id: "mcp",
  label: "Bun + Model Context Protocol server",
  dependencies: {
    "@modelcontextprotocol/sdk": "^1.32.0",
    zod: "^4.0.0"
  },
  devDependencies: {},
  createIndex: getMcpIndexTemplate,
  createTest: getMcpTestTemplate
};

// dist/backend-frameworks/nestjs.js
function getNestIndexTemplate(name, _durability, options = {}) {
  return `import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

// ${LOCAL_FRONTEND_CORS_REASON}
${localFrontendOriginConst()}

@Controller()
class AppController {
  // Health check: Flisk uses this endpoint to check service health
  @Get('health')
  health() {
    return { status: 'ok', service: '${name}' };
  }

  @Get('health/live')
  live() {
    return { status: 'alive', timestamp: Date.now() };
  }

  @Get()
  root() {
    return { service: '${name}', version: '1.0.0', endpoints: ['/health', '/health/live'] };
  }
}

@Module({ controllers: [AppController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
${portFromEnv("port", "  ", options.port)}

  app.enableCors({ origin: LOCAL_FRONTEND_ORIGIN });

  // Bind beyond loopback: Traefik reaches the container over the Docker network.
  await app.listen(port, '0.0.0.0');
  console.log('\\n\u{1F680} ${name} running on http://localhost:' + port);
  console.log('\u{1F4CA} Health check: http://localhost:' + port + '/health\\n');
}

bootstrap();
`;
}
var nestBackendProvider = {
  id: "nestjs",
  label: "Bun + NestJS",
  dependencies: {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "reflect-metadata": "^0.2.2",
    rxjs: "^7.8.1"
  },
  devDependencies: {},
  // Nest's decorators need these; the engine's generated Docker tsconfig already sets them.
  compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true },
  createIndex: getNestIndexTemplate
};

// dist/backend-frameworks/registry.js
var DEFAULT_BACKEND_FRAMEWORK = "hono";
var honoBackendProvider = {
  id: "hono",
  label: "Bun + Hono",
  dependencies: { hono: "^4.0.0" },
  devDependencies: {},
  createIndex: getBackendIndexTemplate,
  createTest: getBackendTestTemplate
};
var BACKEND_FRAMEWORKS = {
  hono: honoBackendProvider,
  express: expressBackendProvider,
  elysia: elysiaBackendProvider,
  fastify: fastifyBackendProvider,
  h3: h3BackendProvider,
  koa: koaBackendProvider,
  nestjs: nestBackendProvider
};
function compatibleLanguages(frameworkId) {
  return Object.keys(BACKEND_LANGUAGES).filter((languageId) => {
    try {
      resolveBackendFramework("backend", frameworkId, BACKEND_LANGUAGES[languageId]);
      return true;
    } catch (error) {
      if (error instanceof FliskError)
        return false;
      throw error;
    }
  });
}
function listBackendFrameworks(languageId) {
  const requested = getBackendLanguage(languageId);
  const namesLanguage = languageId !== void 0;
  return Object.entries(BACKEND_FRAMEWORKS).map(([id, provider]) => {
    const languages = compatibleLanguages(id);
    const compatible = languages.includes(requested.id);
    const languageFlag = namesLanguage ? ` --language ${requested.id}` : "";
    const command = compatible ? `flisk resource <name> --type backend --framework ${id}${languageFlag}` : `flisk resource <name> --type backend${languageFlag}`;
    return {
      id,
      label: provider.label,
      languages,
      compatible,
      command
    };
  });
}
function getBackendFramework(frameworkId) {
  const id = (frameworkId ?? DEFAULT_BACKEND_FRAMEWORK).trim().toLowerCase();
  const provider = Object.hasOwn(BACKEND_FRAMEWORKS, id) ? BACKEND_FRAMEWORKS[id] : void 0;
  if (!provider) {
    const supportedIds = Object.keys(BACKEND_FRAMEWORKS).join(", ");
    throw new FliskError(`Unknown backend framework "${frameworkId}". Supported frameworks: ${supportedIds}.`, [`Use one of: ${supportedIds}`, `Omit --framework to use ${DEFAULT_BACKEND_FRAMEWORK}`]);
  }
  return provider;
}
function resolveBackendFramework(resourceType, frameworkId, language) {
  if (resourceType === "mcp") {
    if (frameworkId !== void 0) {
      throw new FliskError("--framework cannot be combined with --type mcp.", [
        "An mcp resource always scaffolds a Model Context Protocol server",
        "Drop --framework, or use --type backend --framework <id>"
      ]);
    }
    if (language?.createFiles) {
      throw new FliskError(`--language ${language.id} cannot be combined with --type mcp.`, [
        "An mcp resource is a Bun service; drop --language"
      ]);
    }
    return mcpBackendProvider;
  }
  if (resourceType === "agent") {
    if (frameworkId !== void 0 && frameworkId !== "custom") {
      throw new FliskError("--framework cannot be combined with --type agent.", [
        "An agent resource is scaffolded by an agent runtime; use --runtime <id> instead"
      ]);
    }
    if (language?.createFiles) {
      throw new FliskError(`--language ${language.id} cannot be combined with --type agent.`, [
        "An agent resource is a Bun service; drop --language"
      ]);
    }
    return resolveAgentRuntime();
  }
  if (resourceType !== "backend" || frameworkId === void 0)
    return void 0;
  if (language?.createFiles) {
    throw new FliskError(`--framework cannot be combined with --language ${language.id}.`, [
      `The ${language.id} provider owns its runtime and framework`,
      "Drop --framework, or use --language bun"
    ]);
  }
  return getBackendFramework(frameworkId);
}

// dist/frontend-frameworks/lit.js
var litFrontendProvider = {
  id: "lit",
  label: "Lit + Vite",
  vite: { imports: [], plugins: [] },
  dependencies: {
    lit: "^3.2.0"
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
        emoji: "\u{1F4BB}"
      },
      {
        filename: "src/main.ts",
        content: `import './app-root';
`,
        description: "Generating Lit entry",
        emoji: "\u{1F4BB}"
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
        emoji: "\u{1F4BB}"
      }
    ];
  }
};

// dist/frontend-frameworks/next.js
var NEXT_CONFIG = `// FLISK_BASE_PATH is set by flisk up (the route this app is served under, for example /web). On the host it is unset,
// so \`next dev\` serves from the root.
const basePath = process.env.FLISK_BASE_PATH ?? '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  // Flisk's route is /<name>/; with trailingSlash the page answers there instead of redirecting.
  trailingSlash: true,
  output: 'standalone',
  reactStrictMode: true,
};

export default nextConfig;
`;
var STARTER_STYLES = `const page = { maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem', fontFamily: 'system-ui, sans-serif', color: '#1f2933' };
const muted = { color: '#616e7c', marginTop: 0 };
`;
function renderPage(name, backendName) {
  return `${backendName ? "import HealthCard from './health-card';\n\n" : ""}${STARTER_STYLES}
export default function Home() {
  return (
    <main style={page}>
      <h1>${name}</h1>
      <p style={muted}>Flisk frontend (Next.js)</p>
${backendName ? "\n      <HealthCard />\n" : ""}
      <p>Edit <code>src/app/page.tsx</code> and save. It live-reloads.</p>
      <ul>
        <li><a href="http://localhost:10350">Tilt UI</a>: logs and resource status</li>
        <li><code>flisk status</code>: every resource in this project</li>
      </ul>
    </main>
  );
}
`;
}
function renderHealthCard(backendName) {
  return `'use client';

import { useEffect, useState } from 'react';

// Set by flisk up from the backend's route; empty on the host, where the browser calls the same origin.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
const BACKEND_NAME = '${backendName}';

const card = { border: '1px solid #d9e2ec', borderRadius: 8, padding: '1rem 1.25rem', margin: '1.5rem 0' };
const cardHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const pre = { background: '#f5f7fa', borderRadius: 6, padding: '0.75rem', overflowX: 'auto' as const };

interface Health {
  ok: boolean;
  body: unknown;
}

export default function HealthCard() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(API_URL + '/health', { signal: controller.signal })
      .then(async (response) => {
        // Read the body as text first: a non-JSON error page must show its real status, not an unreachable backend.
        const text = await response.text();
        let body: unknown = text;
        try {
          body = JSON.parse(text);
        } catch {
          // keep the raw text
        }
        setHealth({ ok: response.ok, body: { status: response.status, body } });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setHealth({ ok: false, body: { error: String(error) } });
      });
    return () => controller.abort();
  }, []);

  return (
    <section style={card}>
      <div style={cardHeader}>
        <strong>Backend: {BACKEND_NAME}</strong>
        {health === null && <span>checking\u2026</span>}
        {health?.ok === true && <span style={{ color: '#0a7f3f' }}>ok</span>}
        {health?.ok === false && <span style={{ color: '#b42318' }}>unreachable</span>}
      </div>
      {health && <pre style={pre}>{JSON.stringify(health.body, null, 2)}</pre>}
    </section>
  );
}
`;
}
var nextFrontendProvider = {
  id: "next",
  label: "Next.js (App Router)",
  kind: "server",
  dependencies: {
    next: "^15.5.0",
    react: "^19.0.0",
    "react-dom": "^19.0.0"
  },
  devDependencies: {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    // `next build` type-checks through the TypeScript JavaScript API.
    typescript: "^5.9.0",
    // The image installs with npm, which enforces peer ranges: vitest 5 peers on @types/node ^22 || >=24, and the
    // scaffold's ^20 otherwise fails `npm install` with ERESOLVE.
    "@types/node": "^22.0.0"
  },
  compilerOptions: {},
  scripts: {
    dev: "next dev",
    build: "next build",
    start: "next start"
  },
  tsconfig: {
    compilerOptions: {
      target: "ES2022",
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "preserve",
      incremental: true,
      plugins: [{ name: "next" }]
    },
    include: ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts"],
    exclude: ["node_modules"]
  },
  createFiles(name, options = {}) {
    return [
      {
        filename: "next.config.mjs",
        content: NEXT_CONFIG,
        description: "Generating Next.js config",
        emoji: "\u2699\uFE0F"
      },
      {
        filename: "src/app/layout.tsx",
        content: `import type { ReactNode } from 'react';

export const metadata = { title: '${name}' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
        description: "Generating Next.js root layout",
        emoji: "\u{1F4BB}"
      },
      {
        filename: "src/app/page.tsx",
        content: renderPage(name, options.backendName),
        description: "Generating Next.js home page",
        emoji: "\u{1F4BB}"
      },
      {
        filename: "src/app/health/route.ts",
        content: `// The engine probes /<name>/health; the base path puts this route under the same prefix.
export const dynamic = 'force-static';

export function GET() {
  return new Response('ok');
}
`,
        description: "Generating health route",
        emoji: "\u{1FA7A}"
      },
      ...options.backendName ? [
        {
          filename: "src/app/health-card.tsx",
          content: renderHealthCard(options.backendName),
          description: "Generating backend health card",
          emoji: "\u{1F4BB}"
        }
      ] : []
    ];
  }
};

// dist/frontend-frameworks/preact.js
var preactFrontendProvider = {
  id: "preact",
  label: "Preact + Vite",
  vite: {
    imports: ["import preact from '@preact/preset-vite';"],
    plugins: ["preact()"]
  },
  dependencies: {
    preact: "^10.26.0"
  },
  devDependencies: {
    "@preact/preset-vite": "^2.10.0"
  },
  compilerOptions: {
    jsx: "react-jsx",
    jsxImportSource: "preact"
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
        emoji: "\u{1F4BB}"
      },
      {
        filename: "src/main.tsx",
        content: `import { render } from 'preact';
import App from './App';

render(<App />, document.getElementById('app')!);
`,
        description: "Generating Preact entry",
        emoji: "\u{1F4BB}"
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
        emoji: "\u{1F4BB}"
      }
    ];
  }
};

// dist/frontend-frameworks/qwik.js
var qwikFrontendProvider = {
  id: "qwik",
  label: "Qwik + Vite",
  vite: {
    imports: ["import { qwikVite } from '@builder.io/qwik/optimizer';"],
    plugins: ["qwikVite({ csr: true })"]
  },
  dependencies: {
    "@builder.io/qwik": "^1.12.0"
  },
  devDependencies: {},
  compilerOptions: {
    jsx: "react-jsx",
    jsxImportSource: "@builder.io/qwik"
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
        emoji: "\u{1F4BB}"
      },
      {
        filename: "src/main.tsx",
        content: `import '@builder.io/qwik/qwikloader.js';
import { render } from '@builder.io/qwik';
import { App } from './App';

render(document.getElementById('app') as HTMLElement, <App />);
`,
        description: "Generating Qwik entry",
        emoji: "\u{1F4BB}"
      },
      {
        filename: "src/App.tsx",
        content: `import { component$ } from '@builder.io/qwik';

export const App = component$(() => {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>${name}</h1>
      <p>Frontend resource created with Flisk</p>
    </div>
  );
});
`,
        description: "Generating Qwik app",
        emoji: "\u{1F4BB}"
      }
    ];
  }
};

// dist/frontend-frameworks/react.js
var STARTER_STYLES2 = `const page = { maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem', fontFamily: 'system-ui, sans-serif', color: '#1f2933' };
const muted = { color: '#616e7c', marginTop: 0 };
const card = { border: '1px solid #d9e2ec', borderRadius: 8, padding: '1rem 1.25rem', margin: '1.5rem 0' };
const cardHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const pre = { background: '#f5f7fa', borderRadius: 6, padding: '0.75rem', overflowX: 'auto' };
`;
var STARTER_HINTS = `      <p>Edit <code>src/App.tsx</code> and save. It live-reloads.</p>
      <ul>
        <li><a href="http://localhost:10350">Tilt UI</a>: logs and resource status</li>
        <li><code>flisk status</code>: every resource in this project</li>
      </ul>`;
function renderAppWithBackend(name, backendName) {
  return `/// <reference types="vite/client" />
import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const BACKEND_NAME = '${backendName}';

${STARTER_STYLES2}
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
          {health === null && <span>checking\u2026</span>}
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
  return `${STARTER_STYLES2}
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
var reactFrontendProvider = {
  id: "react",
  label: "React + Vite",
  vite: {
    imports: ["import react from '@vitejs/plugin-react';"],
    plugins: ["react()"]
  },
  dependencies: {
    react: "^19.0.0",
    "react-dom": "^19.0.0"
  },
  devDependencies: {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4"
  },
  compilerOptions: {
    jsx: "react-jsx"
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
        emoji: "\u{1F4BB}"
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
        emoji: "\u{1F4BB}"
      },
      {
        filename: "src/App.tsx",
        content: options.backendName ? renderAppWithBackend(name, options.backendName) : renderAppWithoutBackend(name),
        description: "Generating React app",
        emoji: "\u{1F4BB}"
      }
    ];
  }
};

// dist/frontend-frameworks/solid.js
var solidFrontendProvider = {
  id: "solid",
  label: "Solid + Vite",
  vite: {
    imports: ["import solid from 'vite-plugin-solid';"],
    plugins: ["solid()"]
  },
  dependencies: {
    "solid-js": "^1.9.0"
  },
  devDependencies: {
    "vite-plugin-solid": "^2.11.0",
    jsdom: "^27.4.0"
  },
  compilerOptions: {
    jsx: "preserve",
    jsxImportSource: "solid-js"
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
        emoji: "\u{1F4BB}"
      },
      {
        filename: "src/main.tsx",
        content: `import { render } from 'solid-js/web';
import App from './App';

render(() => <App />, document.getElementById('app')!);
`,
        description: "Generating Solid entry",
        emoji: "\u{1F4BB}"
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
        emoji: "\u{1F4BB}"
      }
    ];
  }
};

// dist/frontend-frameworks/svelte.js
var svelteFrontendProvider = {
  id: "svelte",
  label: "Svelte + Vite",
  vite: {
    imports: ["import { svelte } from '@sveltejs/vite-plugin-svelte';"],
    plugins: ["svelte()"]
  },
  dependencies: {
    svelte: "^5.0.0"
  },
  devDependencies: {
    "@sveltejs/vite-plugin-svelte": "^5.0.0"
  },
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
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
        description: "Generating HTML template",
        emoji: "\u{1F4BB}"
      },
      {
        filename: "src/main.ts",
        content: `import { mount } from 'svelte';
import App from './App.svelte';

const app = mount(App, { target: document.getElementById('app')! });

export default app;
`,
        description: "Generating Svelte entry",
        emoji: "\u{1F4BB}"
      },
      {
        filename: "src/App.svelte",
        content: `<script lang="ts">
  const message: string = 'Frontend resource created with Flisk';
</script>

<main style="padding: 2rem; font-family: system-ui">
  <h1>${name}</h1>
  <p>{message}</p>
</main>
`,
        description: "Generating Svelte app",
        emoji: "\u{1F4BB}"
      },
      {
        filename: "src/vite-env.d.ts",
        content: `/// <reference types="svelte" />
/// <reference types="vite/client" />
`,
        description: "Generating Svelte module types",
        emoji: "\u2699\uFE0F"
      }
    ];
  }
};

// dist/frontend-frameworks/tanstack-router.js
var tanstackRouterFrontendProvider = {
  id: "tanstack-router",
  label: "TanStack Router + React + Vite",
  vite: {
    imports: ["import react from '@vitejs/plugin-react';"],
    plugins: ["react()"]
  },
  dependencies: {
    "@tanstack/react-router": "^1.0.0",
    react: "^19.0.0",
    "react-dom": "^19.0.0"
  },
  devDependencies: {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4"
  },
  compilerOptions: {
    jsx: "react-jsx"
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
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
        description: "Generating HTML template",
        emoji: "\u{1F4BB}"
      },
      {
        filename: "src/main.tsx",
        content: `import { RouterProvider } from '@tanstack/react-router';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { router } from './router';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
`,
        description: "Generating TanStack Router entry",
        emoji: "\u{1F4BB}"
      },
      {
        filename: "src/router.tsx",
        content: `/// <reference types="vite/client" />
import { createRootRoute, createRoute, createRouter, Link, Outlet } from '@tanstack/react-router';

const rootRoute = createRootRoute({
  component: () => (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <nav>
        <Link to="/">Home</Link>
      </nav>
      <Outlet />
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <>
      <h1>${name}</h1>
      <p>Frontend resource created with Flisk</p>
    </>
  ),
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({
  routeTree,
  // The app is served under /<name>/ behind Traefik, and Vite exposes that base here.
  basepath: import.meta.env.BASE_URL,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
`,
        description: "Generating TanStack Router routes",
        emoji: "\u{1F4BB}"
      }
    ];
  }
};

// dist/frontend-frameworks/vanilla.js
var vanillaFrontendProvider = {
  id: "vanilla",
  label: "Vanilla TypeScript + Vite",
  vite: { imports: [], plugins: [] },
  dependencies: {},
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
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
        description: "Generating HTML template",
        emoji: "\u{1F4BB}"
      },
      {
        filename: "src/main.ts",
        content: `import { renderApp } from './app';

const root = document.getElementById('app');
if (root) {
  renderApp(root);
}
`,
        description: "Generating vanilla entry",
        emoji: "\u{1F4BB}"
      },
      {
        filename: "src/app.ts",
        content: `export function renderApp(root: HTMLElement): void {
  root.style.padding = '2rem';
  root.style.fontFamily = 'system-ui';

  const title = document.createElement('h1');
  title.textContent = '${name}';

  const note = document.createElement('p');
  note.textContent = 'Frontend resource created with Flisk';

  root.replaceChildren(title, note);
}
`,
        description: "Generating vanilla app",
        emoji: "\u{1F4BB}"
      }
    ];
  }
};

// dist/frontend-frameworks/vue.js
var STARTER_STYLE = `<style scoped>
main { max-width: 640px; margin: 0 auto; padding: 3rem 1.5rem; font-family: system-ui, sans-serif; color: #1f2933; }
.muted { color: #616e7c; margin-top: 0; }
.card { border: 1px solid #d9e2ec; border-radius: 8px; padding: 1rem 1.25rem; margin: 1.5rem 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.ok { color: #0a7f3f; }
.unreachable { color: #b42318; }
pre { background: #f5f7fa; border-radius: 6px; padding: 0.75rem; overflow-x: auto; }
</style>`;
var STARTER_HINTS2 = `    <p>Edit <code>src/App.vue</code> and save. It live-reloads.</p>
    <ul>
      <li><a href="http://localhost:10350">Tilt UI</a>: logs and resource status</li>
      <li><code>flisk status</code>: every resource in this project</li>
    </ul>`;
function renderAppWithBackend2(name, backendName) {
  return `<script setup lang="ts">
import { onMounted, ref } from 'vue';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const BACKEND_NAME = '${backendName}';

interface Health {
  ok: boolean;
  body: unknown;
}

const health = ref<Health | null>(null);

onMounted(async () => {
  try {
    const response = await fetch(API_URL + '/health');
    health.value = { ok: response.ok, body: await response.json() };
  } catch (error) {
    health.value = { ok: false, body: { error: String(error) } };
  }
});
</script>

<template>
  <main>
    <h1>${name}</h1>
    <p class="muted">Flisk frontend</p>

    <section class="card">
      <div class="card-header">
        <strong>Backend: {{ BACKEND_NAME }}</strong>
        <span v-if="health === null">checking\u2026</span>
        <span v-else-if="health.ok" class="ok">ok</span>
        <span v-else class="unreachable">unreachable</span>
      </div>
      <pre v-if="health">{{ JSON.stringify(health.body, null, 2) }}</pre>
    </section>

${STARTER_HINTS2}
  </main>
</template>

${STARTER_STYLE}
`;
}
function renderAppWithoutBackend2(name) {
  return `<script setup lang="ts">
const appName = '${name}';
</script>

<template>
  <main>
    <h1>{{ appName }}</h1>
    <p class="muted">Flisk frontend</p>

${STARTER_HINTS2}
  </main>
</template>

${STARTER_STYLE}
`;
}
var vueFrontendProvider = {
  id: "vue",
  label: "Vue + Vite",
  vite: {
    imports: ["import vue from '@vitejs/plugin-vue';"],
    plugins: ["vue()"]
  },
  dependencies: {
    vue: "^3.5.0"
  },
  devDependencies: {
    "@vitejs/plugin-vue": "^5.2.4"
  },
  compilerOptions: {},
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
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
        description: "Generating HTML template",
        emoji: "\u{1F4BB}"
      },
      {
        filename: "src/main.ts",
        content: `import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');
`,
        description: "Generating Vue entry",
        emoji: "\u{1F4BB}"
      },
      {
        filename: "src/App.vue",
        content: options.backendName ? renderAppWithBackend2(name, options.backendName) : renderAppWithoutBackend2(name),
        description: "Generating Vue app",
        emoji: "\u{1F4BB}"
      },
      {
        filename: "src/vite-env.d.ts",
        content: `/// <reference types="vite/client" />

declare module '*.vue' {
  import type { Component } from 'vue';
  const component: Component;
  export default component;
}
`,
        description: "Generating Vue module types",
        emoji: "\u2699\uFE0F"
      }
    ];
  }
};

// dist/frontend-frameworks/registry.js
var DEFAULT_FRONTEND_FRAMEWORK = "react";
var FRONTEND_FRAMEWORKS = {
  react: reactFrontendProvider,
  vue: vueFrontendProvider,
  svelte: svelteFrontendProvider,
  preact: preactFrontendProvider,
  lit: litFrontendProvider,
  solid: solidFrontendProvider,
  qwik: qwikFrontendProvider,
  vanilla: vanillaFrontendProvider,
  "tanstack-router": tanstackRouterFrontendProvider,
  next: nextFrontendProvider
};
var META_FRAMEWORK_IDS = [
  "nuxt",
  "sveltekit",
  "astro",
  "angular",
  "remix",
  "tanstack-start"
];
var VERIFIED_FRONTEND_FRAMEWORKS = [
  "react",
  "vue",
  "svelte",
  "preact",
  "lit",
  "solid",
  "qwik",
  "vanilla",
  "tanstack-router"
];
function listFrontendFrameworks() {
  return Object.entries(FRONTEND_FRAMEWORKS).map(([id, provider]) => ({
    id,
    label: provider.label,
    kind: provider.kind ?? "vite-spa",
    verified: VERIFIED_FRONTEND_FRAMEWORKS.includes(id),
    command: `flisk resource <name> --type frontend --framework ${id}`
  }));
}
function getFrontendFramework(frameworkId, resourceName) {
  const id = (frameworkId ?? DEFAULT_FRONTEND_FRAMEWORK).trim().toLowerCase();
  const provider = Object.hasOwn(FRONTEND_FRAMEWORKS, id) ? FRONTEND_FRAMEWORKS[id] : void 0;
  if (!provider) {
    const supportedIds = Object.keys(FRONTEND_FRAMEWORKS).join(", ");
    const isMeta = META_FRAMEWORK_IDS.includes(id);
    const byo = `flisk resource ${resourceName ?? "<name>"} --type bring-your-own`;
    throw new FliskError(`${isMeta ? `"${frameworkId}" is not a Vite SPA provider` : `Unknown frontend framework "${frameworkId}"`}. Supported frameworks: ${supportedIds}.`, [
      `Use one of: ${supportedIds}`,
      `Omit --framework to use ${DEFAULT_FRONTEND_FRAMEWORK}`,
      ...isMeta ? [`Create the app with ${id}'s own CLI, then register it: ${byo}`] : []
    ]);
  }
  return provider;
}
function resolveFrontendFramework(resourceType, frameworkId, resourceName) {
  if (resourceType !== "frontend") {
    if (frameworkId !== void 0 && resourceType !== "backend") {
      throw new FliskError("--framework can only be used with --type frontend or --type backend.", [
        "Add --type frontend or --type backend, or drop --framework for this resource type"
      ]);
    }
    return void 0;
  }
  return getFrontendFramework(frameworkId, resourceName);
}

export {
  DEFAULT_AGENT_RUNTIME,
  resolveAgentRuntime,
  resolveAgentDurability,
  getDockerfileTemplate,
  getShutdownHandlerTemplate,
  getWorkerIndexTemplate,
  getTestTemplate,
  getBackendTestTemplate,
  DEFAULT_BACKEND_FRAMEWORK,
  BACKEND_FRAMEWORKS,
  listBackendFrameworks,
  resolveBackendFramework,
  DEFAULT_FRONTEND_FRAMEWORK,
  FRONTEND_FRAMEWORKS,
  listFrontendFrameworks,
  resolveFrontendFramework
};
