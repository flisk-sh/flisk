/**
 * The `custom` agent runtime: a plain Bun HTTP service with no model SDK, no agent framework and no vendor dependency.
 * It is the escape hatch the agent resource type is built on. Replace the `runTurn` body with your model call and tools;
 * the process contract around it (health, readiness, session checkpoints, SIGTERM drain) is what TDK relies on.
 */
export function getCustomAgentIndexTemplate(name) {
    return `import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Contract with TDK (see docs/ai-agents.md):
//   AGENT_DURABILITY  files | postgres   (set by tdk from service.json agent.durability)
//   AGENT_STATE_DIR   where files-durability checkpoints live (a named volume that survives tdk down)
//   DATABASE_URL      set by tdk for postgres durability
//   PORT              port to listen on
// /health: the process is alive. /ready: the checkpoint store is reachable. Idle is healthy, so /health never checks the store.

const DURABILITY = process.env.AGENT_DURABILITY === 'postgres' ? 'postgres' : 'files';
const STATE_DIR = process.env.AGENT_STATE_DIR || join(process.cwd(), '.agent-state');
const PORT = Number(process.env.PORT || 3000);
const DRAIN_TIMEOUT_MS = 10_000;

interface Checkpoint {
  sessionId: string;
  messages: Array<{ role: 'user' | 'agent'; content: string; at: string }>;
}

// Session store. files: one JSON checkpoint per session, written atomically (temp file, then rename), so a kill
// mid-write leaves the previous checkpoint intact. postgres: not implemented in this scaffold; see TODO below.
const store = {
  ready(): boolean {
    if (DURABILITY === 'postgres') return Boolean(process.env.DATABASE_URL);
    try {
      mkdirSync(STATE_DIR, { recursive: true });
      return true;
    } catch {
      return false;
    }
  },
  load(sessionId: string): Checkpoint {
    if (DURABILITY === 'postgres') throw new Error('postgres session store is not implemented in this scaffold');
    const file = join(STATE_DIR, sessionId + '.json');
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { sessionId, messages: [] };
  },
  save(checkpoint: Checkpoint): void {
    if (DURABILITY === 'postgres') throw new Error('postgres session store is not implemented in this scaffold');
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
  res.on('finish', () => inFlight--);
  const url = new URL(req.url ?? '/', 'http://localhost');

  try {
    if (url.pathname === '/health') {
      return sendJson(res, 200, { status: 'ok', service: '${name}', draining });
    }

    if (url.pathname === '/ready') {
      const ok = !draining && store.ready();
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
      const checkpoint = store.load(sessionId);
      checkpoint.messages.push({ role: 'user', content: input, at: new Date().toISOString() });
      const reply = await runTurn(checkpoint, input);
      checkpoint.messages.push({ role: 'agent', content: reply, at: new Date().toISOString() });
      store.save(checkpoint);
      return sendJson(res, 200, { sessionId, reply, turns: checkpoint.messages.length / 2 });
    }

    if (url.pathname === '/session' && req.method === 'GET') {
      const sessionId = String(req.headers['x-session-id'] ?? '');
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) return sendJson(res, 400, { error: 'x-session-id header is required' });
      const checkpoint = store.load(sessionId);
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
export const customAgentRuntime = {
    id: "custom",
    label: "Custom agent runtime (Bun HTTP, no vendor dependency)",
    dependencies: {},
    devDependencies: {},
    createIndex: getCustomAgentIndexTemplate,
};
