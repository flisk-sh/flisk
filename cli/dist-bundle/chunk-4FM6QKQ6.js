import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);

// dist/utils/agent-format.js
function formatAge(iso, now = Date.now()) {
  if (!iso)
    return "-";
  const at = Date.parse(iso);
  if (Number.isNaN(at))
    return iso;
  const seconds = Math.max(0, Math.round((now - at) / 1e3));
  if (seconds < 60)
    return `${seconds}s ago`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// dist/utils/agent-sessions.js
import * as http from "node:http";
var AGENT_REQUEST_TIMEOUT_MS = 1e4;
function httpGet(url, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers, signal: AbortSignal.timeout(timeoutMs) }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const status = res.statusCode ?? 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          text: Buffer.concat(chunks).toString("utf-8")
        });
      });
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}
function agentRequest(routeUrl, path, headers = {}) {
  const route = new URL(routeUrl);
  const allHeaders = { ...headers };
  if (route.hostname.endsWith(".localhost")) {
    allHeaders.host = route.host;
    route.hostname = "127.0.0.1";
  }
  return { url: `${route.origin}${route.pathname.replace(/\/$/, "")}${path}`, headers: allHeaders };
}
function agentSessionRequest(routeUrl, sessionId) {
  return agentRequest(routeUrl, "/session", { "x-session-id": sessionId });
}
function agentSessionListRequest(routeUrl) {
  return agentRequest(routeUrl, "/sessions");
}
async function fetchAgent(request, timeoutMs = AGENT_REQUEST_TIMEOUT_MS) {
  let reply;
  try {
    reply = await httpGet(request.url, request.headers, timeoutMs);
  } catch {
    return { kind: "not-running" };
  }
  let body = {};
  let isJson = true;
  try {
    body = reply.text ? JSON.parse(reply.text) : {};
  } catch {
    body = { raw: reply.text };
    isJson = false;
  }
  if (reply.ok)
    return { kind: "ok", body };
  if ([502, 503, 504].includes(reply.status) || reply.status === 404 && !isJson) {
    return { kind: "not-running" };
  }
  if (reply.status === 404)
    return { kind: "not-found", body };
  const detail = body?.error;
  return {
    kind: "error",
    status: reply.status,
    detail: typeof detail === "string" ? detail : reply.text
  };
}
function parseAgentSessionList(body) {
  if (typeof body !== "object" || body === null)
    return null;
  const raw = body.sessions;
  if (!Array.isArray(raw))
    return null;
  const sessions = [];
  for (const row of raw) {
    if (typeof row !== "object" || row === null)
      continue;
    const r = row;
    if (typeof r.sessionId !== "string" || !r.sessionId)
      continue;
    sessions.push({
      sessionId: r.sessionId,
      lastActivity: typeof r.lastActivity === "string" ? r.lastActivity : null,
      status: typeof r.status === "string" ? r.status : "unknown",
      checkpointBytes: typeof r.checkpointBytes === "number" ? r.checkpointBytes : null
    });
  }
  const total = body.total;
  return { sessions, total: typeof total === "number" ? total : sessions.length };
}
async function fetchAgentOverview(routeUrl, timeoutMs = 3e3) {
  const [ready, list] = await Promise.all([
    fetchAgent(agentRequest(routeUrl, "/ready"), timeoutMs),
    fetchAgent(agentRequest(routeUrl, "/sessions"), timeoutMs)
  ]);
  if (ready.kind === "not-running" && list.kind === "not-running")
    return { state: "not-running" };
  const isReady = ready.kind === "ok" && ready.body?.ready === true;
  return {
    state: "up",
    ready: isReady,
    sessions: list.kind === "ok" ? parseAgentSessionList(list.body) : null
  };
}

export {
  formatAge,
  httpGet,
  agentSessionRequest,
  agentSessionListRequest,
  fetchAgent,
  parseAgentSessionList,
  fetchAgentOverview
};
