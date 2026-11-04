export declare const AGENT_REQUEST_TIMEOUT_MS = 10000;
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
export type AgentReply = {
    kind: "ok";
    body: unknown;
} | {
    kind: "not-running";
} | {
    kind: "not-found";
    body: unknown;
} | {
    kind: "error";
    status: number;
    detail: string;
};
/** GET with node:http because fetch silently drops a custom Host header, which is what Traefik routes on. */
export declare function httpGet(url: string, headers: Record<string, string>, timeoutMs: number): Promise<{
    ok: boolean;
    status: number;
    text: string;
}>;
/**
 * Agent containers publish no host port; the only way in is the Traefik route that `flisk status` prints as `url`
 * (for example http://api.<project>.localhost:8080/api/bot). `*.localhost` does not resolve everywhere (glibc without
 * systemd-resolved), so connect to loopback and keep the route's host in the Host header, which is all Traefik matches on.
 */
export declare function agentRequest(routeUrl: string, path: string, headers?: Record<string, string>): {
    url: string;
    headers: Record<string, string>;
};
/** The request for one session's checkpoint: `GET /session`, keyed by the `x-session-id` header. */
export declare function agentSessionRequest(routeUrl: string, sessionId: string): {
    url: string;
    headers: Record<string, string>;
};
/** The request for the session list: `GET /sessions`, which needs no session id. */
export declare function agentSessionListRequest(routeUrl: string): {
    url: string;
    headers: Record<string, string>;
};
export declare function fetchAgent(request: {
    url: string;
    headers: Record<string, string>;
}, timeoutMs?: number): Promise<AgentReply>;
/**
 * Reads a `GET /sessions` body. Returns null when it is not the list shape, so a caller can tell a wrong endpoint from
 * an agent with no sessions. Rows without a usable id are dropped; the agent owns its other fields.
 */
export declare function parseAgentSessionList(body: unknown): AgentSessionList | null;
/**
 * What `flisk ui` shows for the selected agent. `not-running`: nothing answered. Otherwise the agent is up and `ready`
 * is its `/ready` answer; `sessions` is null when it has no `/sessions` endpoint (built before that existed) or the
 * list could not be read.
 */
export type AgentOverview = {
    state: "not-running";
} | {
    state: "up";
    ready: boolean;
    sessions: AgentSessionList | null;
};
/** Reads `/ready` and `/sessions` once, in parallel. Never throws: a failure is part of the answer. */
export declare function fetchAgentOverview(routeUrl: string, timeoutMs?: number): Promise<AgentOverview>;
