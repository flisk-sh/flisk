// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import * as http from "node:http";

export const AGENT_REQUEST_TIMEOUT_MS = 10_000;

/** One row of an agent's `GET /sessions` answer. Fields the agent did not send are null. */
export interface AgentSessionSummary {
  sessionId: string;
  lastActivity: string | null;
  status: string;
  checkpointBytes: number | null;
}

export interface AgentSessionList {
  sessions: AgentSessionSummary[];
  total: number;
}

/**
 * What one request to an agent came back with. `not-running`: nothing answered, or the gateway answered for a missing
 * backend. `not-found`: the agent itself answered 404, which for `/sessions` means it was built before that endpoint.
 */
export type AgentReply =
  | { kind: "ok"; body: unknown }
  | { kind: "not-running" }
  | { kind: "not-found"; body: unknown }
  | { kind: "error"; status: number; detail: string };

/** GET with node:http because fetch silently drops a custom Host header, which is what Traefik routes on. */
export function httpGet(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; text: string }> {
  return new Promise((resolve, reject) => {
    // One signal covers the connection and the body read, so a hung agent cannot block the CLI.
    const req = http.get(url, { headers, signal: AbortSignal.timeout(timeoutMs) }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const status = res.statusCode ?? 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          text: Buffer.concat(chunks).toString("utf-8"),
        });
      });
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

/**
 * Agent containers publish no host port; the only way in is the Traefik route that `flisk status` prints as `url`
 * (for example http://api.<project>.localhost:8080/api/bot). `*.localhost` does not resolve everywhere (glibc without
 * systemd-resolved), so connect to loopback and keep the route's host in the Host header, which is all Traefik matches on.
 */
export function agentRequest(
  routeUrl: string,
  path: string,
  headers: Record<string, string> = {},
): { url: string; headers: Record<string, string> } {
  const route = new URL(routeUrl);
  const allHeaders: Record<string, string> = { ...headers };
  if (route.hostname.endsWith(".localhost")) {
    allHeaders.host = route.host;
    route.hostname = "127.0.0.1";
  }
  return { url: `${route.origin}${route.pathname.replace(/\/$/, "")}${path}`, headers: allHeaders };
}

/** The request for one session's checkpoint: `GET /session`, keyed by the `x-session-id` header. */
export function agentSessionRequest(
  routeUrl: string,
  sessionId: string,
): { url: string; headers: Record<string, string> } {
  return agentRequest(routeUrl, "/session", { "x-session-id": sessionId });
}

/** The request for the session list: `GET /sessions`, which needs no session id. */
export function agentSessionListRequest(routeUrl: string): {
  url: string;
  headers: Record<string, string>;
} {
  return agentRequest(routeUrl, "/sessions");
}

export async function fetchAgent(
  request: { url: string; headers: Record<string, string> },
  timeoutMs = AGENT_REQUEST_TIMEOUT_MS,
): Promise<AgentReply> {
  let reply: { ok: boolean; status: number; text: string };
  try {
    reply = await httpGet(request.url, request.headers, timeoutMs);
  } catch {
    return { kind: "not-running" };
  }

  let body: unknown = {};
  let isJson = true;
  try {
    body = reply.text ? JSON.parse(reply.text) : {};
  } catch {
    body = { raw: reply.text };
    isJson = false;
  }
  if (reply.ok) return { kind: "ok", body };

  // Traefik answers 502/503/504 when the route has no live container and a plain-text 404 when it has no route at
  // all. An agent's own errors are JSON, so a non-JSON 404 is the gateway, not the agent.
  if ([502, 503, 504].includes(reply.status) || (reply.status === 404 && !isJson)) {
    return { kind: "not-running" };
  }
  if (reply.status === 404) return { kind: "not-found", body };
  const detail = (body as { error?: unknown })?.error;
  return {
    kind: "error",
    status: reply.status,
    detail: typeof detail === "string" ? detail : reply.text,
  };
}

/**
 * Reads a `GET /sessions` body. Returns null when it is not the list shape, so a caller can tell a wrong endpoint from
 * an agent with no sessions. Rows without a usable id are dropped; the agent owns its other fields.
 */
export function parseAgentSessionList(body: unknown): AgentSessionList | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = (body as { sessions?: unknown }).sessions;
  if (!Array.isArray(raw)) return null;
  const sessions: AgentSessionSummary[] = [];
  for (const row of raw) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    if (typeof r.sessionId !== "string" || !r.sessionId) continue;
    sessions.push({
      sessionId: r.sessionId,
      lastActivity: typeof r.lastActivity === "string" ? r.lastActivity : null,
      status: typeof r.status === "string" ? r.status : "unknown",
      checkpointBytes: typeof r.checkpointBytes === "number" ? r.checkpointBytes : null,
    });
  }
  const total = (body as { total?: unknown }).total;
  return { sessions, total: typeof total === "number" ? total : sessions.length };
}

/**
 * What `flisk ui` shows for the selected agent. `not-running`: nothing answered. Otherwise the agent is up and `ready`
 * is its `/ready` answer; `sessions` is null when it has no `/sessions` endpoint (built before that existed) or the
 * list could not be read.
 */
export type AgentOverview =
  | { state: "not-running" }
  | { state: "up"; ready: boolean; sessions: AgentSessionList | null };

/** Reads `/ready` and `/sessions` once, in parallel. Never throws: a failure is part of the answer. */
export async function fetchAgentOverview(
  routeUrl: string,
  timeoutMs = 3_000,
): Promise<AgentOverview> {
  const [ready, list] = await Promise.all([
    fetchAgent(agentRequest(routeUrl, "/ready"), timeoutMs),
    fetchAgent(agentRequest(routeUrl, "/sessions"), timeoutMs),
  ]);
  if (ready.kind === "not-running" && list.kind === "not-running") return { state: "not-running" };
  // /ready answers 503 with { ready: false } when the checkpoint store is down, which fetchAgent reports as "not-running".
  const isReady = ready.kind === "ok" && (ready.body as { ready?: unknown })?.ready === true;
  return {
    state: "up",
    ready: isReady,
    sessions: list.kind === "ok" ? parseAgentSessionList(list.body) : null,
  };
}
