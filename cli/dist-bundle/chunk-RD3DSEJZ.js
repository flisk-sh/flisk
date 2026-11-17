import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  agentSessionListRequest,
  agentSessionRequest,
  fetchAgent,
  formatAge,
  parseAgentSessionList
} from "./chunk-4FM6QKQ6.js";
import {
  getHostPortPlan
} from "./chunk-SYTFMWWH.js";
import {
  buildServicePorts
} from "./chunk-ZI7AIJRM.js";
import {
  runResourcesList
} from "./chunk-I4YXAJOD.js";
import {
  createDiscoveryContext
} from "./chunk-4EDXFYDP.js";
import {
  createMachineEnvelope,
  writeMachineError
} from "./chunk-3SNMUNQF.js";
import {
  isNativeProject
} from "./chunk-2BH5UW2N.js";
import {
  formatBytes
} from "./chunk-ARPSTQFE.js";
import {
  FliskError,
  errorFactories,
  findProjectRoot,
  runCommand,
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/commands/agent.js
import { Command } from "commander";
var WATCH_INTERVAL_MS = 2e3;
function formatSessionTable(list, now = Date.now()) {
  if (list.sessions.length === 0)
    return ["No sessions yet."];
  const rows = list.sessions.map((s) => [
    s.sessionId,
    formatAge(s.lastActivity, now),
    s.status,
    s.checkpointBytes === null ? "-" : formatBytes(s.checkpointBytes)
  ]);
  const header = ["SESSION", "LAST ACTIVITY", "STATUS", "CHECKPOINT"];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => i === cells.length - 1 ? c : c.padEnd(widths[i])).join("  ").trimEnd();
  const lines = [line(header), ...rows.map(line)];
  if (list.total > list.sessions.length) {
    lines.push(`... ${list.total - list.sessions.length} more not shown`);
  }
  return lines;
}
var agentCommand = new Command("agent").description("Inspect and operate AI agent resources").addHelpText("after", "\nExamples:\n  flisk agent list\n  flisk agent list --json\n  flisk agent sessions <resource>");
agentCommand.command("list").description("List AI agent resources in the project").option("-v, --verbose", "Show detailed information about each agent resource", false).option("-s, --stack <stack>", "Filter agent resources by stack name").option("--no-stack", "Show only agent resources without a stack").option("--ports", "Show port assignments", false).option("--json", "Output one JSON object and exit", false).addHelpText("after", "\nExamples:\n  flisk agent list\n  flisk agent list --stack shop\n  flisk agent list --json").action(async (options) => {
  await runResourcesList({ ...options, type: "agent" });
});
agentCommand.command("sessions <resource>").description("List the sessions of a running AI agent resource, or inspect one session's checkpoint").option("--session-id <id>", "Session ID to fetch; without it, list all sessions").option("--watch", "Refresh the output every 2 seconds until interrupted", false).option("--json", "Output one JSON object and exit", false).action(async (resourceName, options) => {
  const fail = ({ code, message, hints }) => {
    if (options.json) {
      console.log(JSON.stringify(createMachineEnvelope(null, [
        {
          code,
          message,
          ...hints && hints.length > 0 ? { suggestions: hints } : {}
        }
      ])));
      process.exit(1);
    }
    throw new FliskError(message, hints);
  };
  const action = async () => {
    if (options.watch && options.json) {
      fail({
        code: "USAGE",
        message: "--watch refreshes a table on the terminal and cannot be combined with --json."
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
      const error = errorFactories.unknownResource(resourceName, discovery.resources.map((candidate) => candidate.name));
      fail({
        code: error.code,
        message: error.message,
        hints: error.suggestions
      });
      return;
    }
    const appType = resource.config?.appType ?? resource.type;
    if (appType !== "agent") {
      const agents = discovery.resources.filter((candidate) => (candidate.config?.appType ?? candidate.type) === "agent").map((candidate) => candidate.name);
      fail({
        code: "NOT_AN_AGENT",
        message: `Resource "${resourceName}" is of type "${appType}", not "agent".`,
        hints: [
          ...agents.length ? [`Agent resources: ${agents.sort().join(", ")}`] : [],
          "List agents with: flisk agent list",
          "Create one with: flisk resource <name> --type agent"
        ]
      });
    }
    const port = resource.port;
    if (!port) {
      fail({ code: "NO_PORT", message: `Agent "${resourceName}" has no assigned port.` });
    }
    const portPlan = root ? await getHostPortPlan(root, { inspectDocker: false }).catch(() => null) : null;
    const native = isNativeProject(discovery.resources);
    const ports = buildServicePorts(resource, portPlan?.ingressHttp, { native });
    const routeUrl = native ? ports.directUrl : ports.url;
    if (!routeUrl) {
      fail({
        code: "NO_ROUTE",
        message: `Agent "${resourceName}" has no ingress route to reach it through.`
      });
      return;
    }
    const sessionId = typeof options.sessionId === "string" ? options.sessionId.trim() : "";
    const notRunning = {
      code: "AGENT_NOT_RUNNING",
      message: `Agent "${resourceName}" is not responding at ${routeUrl}. Is the stack running?`,
      hints: ["Start the stack with: flisk up"]
    };
    const requestFailed = (reply) => ({
      code: "AGENT_REQUEST_FAILED",
      message: `Agent returned ${reply.status}: ${reply.detail}`
    });
    const load = async () => {
      if (sessionId) {
        const reply2 = await fetchAgent(agentSessionRequest(routeUrl, sessionId));
        if (reply2.kind === "not-running")
          return { ok: false, failure: notRunning };
        if (reply2.kind === "not-found") {
          const detail = reply2.body?.error;
          return {
            ok: false,
            failure: requestFailed({
              kind: "error",
              status: 404,
              detail: typeof detail === "string" ? detail : JSON.stringify(reply2.body)
            })
          };
        }
        if (reply2.kind === "error")
          return { ok: false, failure: requestFailed(reply2) };
        return {
          ok: true,
          data: { agent: resourceName, port, session: reply2.body },
          lines: [
            source_default.bold(`Sessions for ${resourceName}:`),
            JSON.stringify(reply2.body, null, 2)
          ]
        };
      }
      const reply = await fetchAgent(agentSessionListRequest(routeUrl));
      if (reply.kind === "not-running")
        return { ok: false, failure: notRunning };
      const list = reply.kind === "ok" ? parseAgentSessionList(reply.body) : null;
      if (reply.kind === "not-found" || reply.kind === "ok" && !list) {
        return {
          ok: false,
          failure: {
            code: "SESSION_LIST_UNSUPPORTED",
            message: `Agent "${resourceName}" does not serve GET /sessions; it was created before Flisk could list agent sessions.`,
            hints: [
              `Read one session with: flisk agent sessions ${resourceName} --session-id <id>`,
              "Or copy the /sessions handler from a new scaffold (flisk resource <name> --type agent) into the agent's src/index.ts"
            ]
          }
        };
      }
      if (reply.kind === "error")
        return { ok: false, failure: requestFailed(reply) };
      const sessions = list;
      return {
        ok: true,
        data: { agent: resourceName, port, sessions: sessions.sessions, total: sessions.total },
        lines: [source_default.bold(`Sessions for ${resourceName}:`), ...formatSessionTable(sessions)]
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
    for (; ; ) {
      const result = await load();
      const lines = result.ok ? result.lines : [source_default.red(result.failure.message), ...result.failure.hints ?? []];
      process.stdout.write("\x1B[2J\x1B[H");
      for (const line of lines)
        console.log(line);
      console.log(source_default.dim(`
Refreshing every ${WATCH_INTERVAL_MS / 1e3}s. Ctrl+C to stop.`));
      await new Promise((resolve) => setTimeout(resolve, WATCH_INTERVAL_MS));
    }
  };
  if (options.json) {
    try {
      await action();
    } catch (err) {
      writeMachineError(err);
    }
    return;
  }
  await runCommand(action);
});

export {
  formatSessionTable,
  agentCommand
};
