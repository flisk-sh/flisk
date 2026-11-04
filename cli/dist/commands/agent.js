// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { Command } from "commander";
import { formatAge } from "../utils/agent-format.js";
import { agentSessionListRequest, agentSessionRequest, fetchAgent, parseAgentSessionList, } from "../utils/agent-sessions.js";
import { createDiscoveryContext } from "../utils/discovery-context.js";
import { errorFactories, FliskError, runCommand } from "../utils/errors.js";
import { formatBytes } from "../utils/formatting.js";
import { getHostPortPlan } from "../utils/host-port-config.js";
import { createMachineEnvelope, writeMachineError } from "../utils/machine-output.js";
import { isNativeProject } from "../utils/native-service.js";
import { findProjectRoot } from "../utils/paths.js";
import { buildServicePorts } from "../utils/status-ports.js";
export { formatAge } from "../utils/agent-format.js";
export { agentSessionRequest, httpGet } from "../utils/agent-sessions.js";
const WATCH_INTERVAL_MS = 2_000;
/** The plain-text table `flisk agent sessions <resource>` prints, one line per session. */
export function formatSessionTable(list, now = Date.now()) {
    if (list.sessions.length === 0)
        return ["No sessions yet."];
    const rows = list.sessions.map((s) => [
        s.sessionId,
        formatAge(s.lastActivity, now),
        s.status,
        s.checkpointBytes === null ? "-" : formatBytes(s.checkpointBytes),
    ]);
    const header = ["SESSION", "LAST ACTIVITY", "STATUS", "CHECKPOINT"];
    const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
    const line = (cells) => cells
        .map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i])))
        .join("  ")
        .trimEnd();
    const lines = [line(header), ...rows.map(line)];
    if (list.total > list.sessions.length) {
        lines.push(`... ${list.total - list.sessions.length} more not shown`);
    }
    return lines;
}
export const agentCommand = new Command("agent").description("Inspect and operate AI agent resources");
agentCommand
    .command("sessions <resource>")
    .description("List the sessions of a running AI agent resource, or inspect one session's checkpoint")
    .option("--session-id <id>", "Session ID to fetch; without it, list all sessions")
    .option("--watch", "Refresh the output every 2 seconds until interrupted", false)
    .option("--json", "Output one JSON object and exit", false)
    .action(async (resourceName, options) => {
    // JSON mode prints its envelope and exits 1; human mode throws, and runCommand prints the message and hints.
    const fail = ({ code, message, hints }) => {
        if (options.json) {
            console.log(JSON.stringify(createMachineEnvelope(null, [{ code, message }])));
            process.exit(1);
        }
        throw new FliskError(message, hints);
    };
    const action = async () => {
        if (options.watch && options.json) {
            fail({
                code: "USAGE",
                message: "--watch refreshes a table on the terminal and cannot be combined with --json.",
            });
        }
        const root = findProjectRoot();
        if (!root) {
            const error = errorFactories.notInProject();
            if (options.json)
                writeMachineError(error);
            error.exit();
        }
        const discovery = createDiscoveryContext();
        const resource = discovery.resources.find((r) => r.name === resourceName);
        if (!resource) {
            fail({
                code: "UNKNOWN_RESOURCE",
                message: `Resource "${resourceName}" not found in project.`,
            });
            return;
        }
        const appType = resource.config?.appType ?? resource.type;
        if (appType !== "agent") {
            fail({
                code: "NOT_AN_AGENT",
                message: `Resource "${resourceName}" is of type "${appType}", not "agent".`,
            });
        }
        const port = resource.port;
        if (!port) {
            fail({ code: "NO_PORT", message: `Agent "${resourceName}" has no assigned port.` });
        }
        const portPlan = root
            ? await getHostPortPlan(root, { inspectDocker: false }).catch(() => null)
            : null;
        // A local process has no ingress route: it answers on localhost at its own port.
        const native = isNativeProject(discovery.resources);
        const ports = buildServicePorts(resource, portPlan?.ingressHttp, { native });
        const routeUrl = native ? ports.directUrl : ports.url;
        if (!routeUrl) {
            fail({
                code: "NO_ROUTE",
                message: `Agent "${resourceName}" has no ingress route to reach it through.`,
            });
            return;
        }
        // With an id: the one checkpoint that GET /session returns. Without: the list from GET /sessions.
        const sessionId = typeof options.sessionId === "string" ? options.sessionId.trim() : "";
        const notRunning = {
            code: "AGENT_NOT_RUNNING",
            message: `Agent "${resourceName}" is not responding at ${routeUrl}. Is the stack running?`,
            hints: ["Start the stack with: flisk up"],
        };
        const requestFailed = (reply) => ({
            code: "AGENT_REQUEST_FAILED",
            message: `Agent returned ${reply.status}: ${reply.detail}`,
        });
        /** One request and its rendering: the data for --json, or the lines a human sees. */
        const load = async () => {
            if (sessionId) {
                const reply = await fetchAgent(agentSessionRequest(routeUrl, sessionId));
                if (reply.kind === "not-running")
                    return { ok: false, failure: notRunning };
                if (reply.kind === "not-found") {
                    const detail = reply.body?.error;
                    return {
                        ok: false,
                        failure: requestFailed({
                            kind: "error",
                            status: 404,
                            detail: typeof detail === "string" ? detail : JSON.stringify(reply.body),
                        }),
                    };
                }
                if (reply.kind === "error")
                    return { ok: false, failure: requestFailed(reply) };
                return {
                    ok: true,
                    data: { agent: resourceName, port, session: reply.body },
                    lines: [
                        chalk.bold(`Sessions for ${resourceName}:`),
                        JSON.stringify(reply.body, null, 2),
                    ],
                };
            }
            const reply = await fetchAgent(agentSessionListRequest(routeUrl));
            if (reply.kind === "not-running")
                return { ok: false, failure: notRunning };
            // The agent answered, but not for /sessions: it was scaffolded before the list endpoint existed.
            const list = reply.kind === "ok" ? parseAgentSessionList(reply.body) : null;
            if (reply.kind === "not-found" || (reply.kind === "ok" && !list)) {
                return {
                    ok: false,
                    failure: {
                        code: "SESSION_LIST_UNSUPPORTED",
                        message: `Agent "${resourceName}" does not serve GET /sessions; it was created before Flisk could list agent sessions.`,
                        hints: [
                            `Read one session with: flisk agent sessions ${resourceName} --session-id <id>`,
                            "Or copy the /sessions handler from a new scaffold (flisk resource <name> --type agent) into the agent's src/index.ts",
                        ],
                    },
                };
            }
            if (reply.kind === "error")
                return { ok: false, failure: requestFailed(reply) };
            const sessions = list;
            return {
                ok: true,
                data: { agent: resourceName, port, sessions: sessions.sessions, total: sessions.total },
                lines: [chalk.bold(`Sessions for ${resourceName}:`), ...formatSessionTable(sessions)],
            };
        };
        if (!options.watch) {
            const result = await load();
            if (!result.ok) {
                fail(result.failure);
                return;
            }
            if (options.json) {
                console.log(JSON.stringify(createMachineEnvelope(result.data)));
                return;
            }
            for (const line of result.lines)
                console.log(line);
            return;
        }
        // --watch: redraw on a timer. A failed refresh (the agent restarting, say) is shown and retried, not fatal.
        for (;;) {
            const result = await load();
            const lines = result.ok
                ? result.lines
                : [chalk.red(result.failure.message), ...(result.failure.hints ?? [])];
            process.stdout.write("\x1b[2J\x1b[H");
            for (const line of lines)
                console.log(line);
            console.log(chalk.dim(`\nRefreshing every ${WATCH_INTERVAL_MS / 1000}s. Ctrl+C to stop.`));
            await new Promise((resolve) => setTimeout(resolve, WATCH_INTERVAL_MS));
        }
    };
    if (options.json) {
        try {
            await action();
        }
        catch (err) {
            writeMachineError(err);
        }
        return;
    }
    await runCommand(action);
});
