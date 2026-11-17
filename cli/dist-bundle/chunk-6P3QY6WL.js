import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  findTool,
  toolIds
} from "./chunk-HN4WUGQ5.js";
import {
  DEFAULT_MCP_CLI_TIMEOUT_MS,
  collectSidecarDependents,
  isGeneratedComposeContainer,
  resolveRestartCliTimeoutMs,
  resolveRestartSequenceCliTimeoutMs
} from "./chunk-XPKSQX6T.js";
import {
  withFailureLogs
} from "./chunk-AD3ZB2GJ.js";
import {
  isProcessAlive,
  nativeServiceStates,
  readNativeRunState
} from "./chunk-4L23R74S.js";
import {
  cliInvocation
} from "./chunk-CFZG7IYF.js";
import {
  PROJECT_TEMPLATES,
  listProjectTemplates
} from "./chunk-4CRSIAQJ.js";
import {
  getHostPortPlan
} from "./chunk-SYTFMWWH.js";
import {
  buildServicePorts
} from "./chunk-ZI7AIJRM.js";
import {
  createDiscoveryContext
} from "./chunk-4EDXFYDP.js";
import {
  createMachineEnvelope,
  writeMachineError
} from "./chunk-3SNMUNQF.js";
import {
  OUTPUT_WITHHELD,
  clearDiscoveryResultCache,
  discoverResourcesWithProblems,
  isNativeProject,
  projectSecretValues,
  redactProjectText,
  redactValue
} from "./chunk-2BH5UW2N.js";
import {
  RESOURCE_CREATE_TYPE_VALUES
} from "./chunk-U3566SRZ.js";
import {
  FliskError,
  errorFactories,
  findProjectRoot,
  getPackageVersion,
  runCommand,
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/commands/mcp.js
import { createInterface } from "node:readline";
import { Command as Command2 } from "commander";

// dist/mcp/policy.js
function isTruthy(value) {
  return value !== void 0 && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
function resolveToolPolicy(tools, options, env = process.env) {
  const readOnly = options.readOnly ?? isTruthy(env.FLISK_MCP_READ_ONLY);
  const rawList = options.tools ?? env.FLISK_MCP_TOOLS;
  const names2 = (rawList ?? "").split(",").map((name) => name.trim()).filter(Boolean);
  if (!readOnly && names2.length === 0)
    return null;
  const known = new Set(tools.map((tool) => tool.name));
  const unknown = names2.filter((name) => !known.has(name));
  if (unknown.length > 0) {
    throw new FliskError(`Unknown MCP tool in the allowlist: ${unknown.join(", ")}`, [
      `Available tools: ${[...known].join(", ")}`
    ]);
  }
  const allowed = new Set(names2);
  const hasAllowlist = names2.length > 0;
  return {
    isAllowed: (tool) => (!readOnly || tool.annotations?.readOnlyHint === true) && (!hasAllowlist || allowed.has(tool.name)),
    refusal: (tool) => {
      const why = readOnly && tool.annotations?.readOnlyHint !== true ? "this Flisk MCP server is read-only (started with --read-only or FLISK_MCP_READ_ONLY), so it only runs tools that change nothing" : "this Flisk MCP server only allows an explicit list of tools (--tools or FLISK_MCP_TOOLS)";
      return `${tool.name} is not available: ${why}. Do not retry it. Ask the user to run the command themselves, or to restart the MCP server without ${readOnly ? "--read-only" : "--tools"} to give you write access.`;
    }
  };
}

// dist/mcp/server.js
var SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
var ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602
};
function reply(id, result) {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}
function fail(id, code, message) {
  return JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}
var SYNONYM_GROUPS = [
  ["resource", "resources", "service", "services", "name", "names", "app", "apps"]
];
function editDistance(a, b) {
  const rows = [];
  for (let i = 0; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      if (i === 0) {
        row[j] = j;
        continue;
      }
      let best = Math.min((rows[i - 1]?.[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (rows[i - 1]?.[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, (rows[i - 2]?.[j - 2] ?? 0) + 1);
      }
      row[j] = best;
    }
    rows.push(row);
  }
  return rows[a.length]?.[b.length] ?? 0;
}
function closestArgument(unknown, accepted) {
  const lower = unknown.toLowerCase();
  const group = SYNONYM_GROUPS.find((names2) => names2.includes(lower));
  const synonym = group ? accepted.find((name) => group.includes(name.toLowerCase())) : void 0;
  if (synonym)
    return synonym;
  let best;
  for (const name of accepted) {
    const distance = editDistance(lower, name.toLowerCase());
    if (distance <= Math.max(1, Math.floor(name.length / 3)) && (!best || distance < best.distance)) {
      best = { name, distance };
    }
  }
  return best?.name;
}
function unknownArgumentsMessage(inputSchema, args) {
  if (inputSchema.additionalProperties !== false)
    return void 0;
  const properties = inputSchema.properties;
  if (typeof properties !== "object" || properties === null)
    return void 0;
  const accepted = Object.keys(properties);
  const unknown = Object.keys(args).filter((key) => !accepted.includes(key));
  if (unknown.length === 0)
    return void 0;
  const lines = [
    `Unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}. The call was not run.`,
    `Accepted arguments: ${accepted.length > 0 ? accepted.join(", ") : "(none)"}.`
  ];
  for (const key of unknown) {
    const match = closestArgument(key, accepted);
    if (match)
      lines.push(`Did you mean "${match}" instead of "${key}"?`);
  }
  return lines.join("\n");
}
function createMcpServer(allTools, info, policy) {
  const tools = policy ? allTools.filter((tool) => policy.isAllowed(tool)) : allTools;
  const byName = /* @__PURE__ */ new Map();
  const refused = /* @__PURE__ */ new Map();
  for (const tool of allTools) {
    if (tools.includes(tool))
      continue;
    for (const alias of tool.aliases ?? [])
      refused.set(alias, tool);
    refused.set(tool.name, tool);
  }
  for (const tool of tools)
    for (const alias of tool.aliases ?? [])
      byName.set(alias, tool);
  for (const tool of tools)
    byName.set(tool.name, tool);
  async function handle(message) {
    const isNotification = message.id === void 0;
    if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      return isNotification ? null : fail(message.id, ERROR.invalidRequest, "Invalid request");
    }
    switch (message.method) {
      case "initialize": {
        const requested = String(message.params?.protocolVersion ?? "");
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
        return reply(message.id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: info
        });
      }
      case "ping":
        return reply(message.id, {});
      case "tools/list":
        return reply(message.id, {
          tools: tools.map(({ name, description, inputSchema, annotations }) => ({
            name,
            description,
            inputSchema,
            ...annotations ? { annotations } : {}
          }))
        });
      case "tools/call": {
        const name = message.params?.name;
        const tool = typeof name === "string" ? byName.get(name) : void 0;
        const blocked = typeof name === "string" && !tool ? refused.get(name) : void 0;
        if (blocked && policy) {
          const text = policy.refusal(blocked);
          return reply(message.id, { content: [{ type: "text", text }], isError: true });
        }
        if (!tool)
          return fail(message.id, ERROR.invalidParams, `Unknown tool: ${String(name)}`);
        const args = message.params?.arguments;
        if (args !== void 0 && (typeof args !== "object" || args === null || Array.isArray(args))) {
          return fail(message.id, ERROR.invalidParams, "arguments must be an object");
        }
        const unknownMessage = unknownArgumentsMessage(tool.inputSchema, args ?? {});
        if (unknownMessage) {
          return reply(message.id, {
            content: [{ type: "text", text: unknownMessage }],
            isError: true
          });
        }
        try {
          const result = await tool.handler(args ?? {});
          return reply(message.id, {
            content: [{ type: "text", text: JSON.stringify(result.data) }],
            structuredContent: result.data,
            isError: result.isError
          });
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error);
          const suggestions = error?.suggestions;
          const hints = Array.isArray(suggestions) ? suggestions.filter((s) => typeof s === "string") : [];
          return reply(message.id, {
            content: [
              {
                type: "text",
                text: hints.length > 0 ? `${text}
${hints.map((s) => `- ${s}`).join("\n")}` : text
              }
            ],
            isError: true
          });
        }
      }
      default:
        return isNotification ? null : fail(message.id, ERROR.methodNotFound, `Method not found: ${message.method}`);
    }
  }
  return {
    async handleLine(line) {
      if (!line.trim())
        return null;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        return fail(null, ERROR.parse, "Parse error");
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return fail(null, ERROR.invalidRequest, "Invalid request");
      }
      return handle(parsed);
    }
  };
}

// dist/mcp/tools.js
import { spawn } from "node:child_process";
import { closeSync, openSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
var NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
var SINCE = /^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$/;
var PROJECT_INIT_TIMEOUT_MS = 3e5;
var IMPORT_TIMEOUT_MS = 3e5;
var runFliskCli = (args, options = {}) => new Promise((resolve, reject) => {
  const [command, ...prefix] = cliInvocation();
  const child = spawn(command, [...prefix, ...args], {
    cwd: options.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NO_COLOR: "1" }
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const timer = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs ?? DEFAULT_MCP_CLI_TIMEOUT_MS);
  child.once("error", (error) => {
    clearTimeout(timer);
    reject(error);
  });
  child.once("close", (exitCode) => {
    clearTimeout(timer);
    resolve({ exitCode, stdout, stderr });
  });
});
function names(value, field) {
  if (value === void 0)
    return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !NAME.test(item))) {
    throw new FliskError(`${field} must be an array of names (letters, digits, ".", "_", "-")`, [
      `Pass ${field} as an array of names, for example ["orders-api"]`
    ]);
  }
  return value;
}
function optionalName(value, field) {
  if (value === void 0)
    return void 0;
  if (typeof value !== "string" || !NAME.test(value)) {
    throw new FliskError(`${field} must be a name (letters, digits, ".", "_", "-")`, [
      `Pass ${field} as a name that does not start with "-", for example orders-api`
    ]);
  }
  return value;
}
function flag(value, field, fallback = false) {
  if (value === void 0)
    return fallback;
  if (typeof value !== "boolean") {
    throw new FliskError(`${field} must be a boolean`, [
      `Pass true or false, or omit ${field} for ${fallback}`
    ]);
  }
  return value;
}
function optionalChoice(value, field, choices) {
  if (value === void 0)
    return void 0;
  if (typeof value !== "string" || !choices.includes(value)) {
    throw new FliskError(`${field} must be one of: ${choices.join(", ")}`, [
      `Omit ${field} to use the command's default`
    ]);
  }
  return value;
}
function optionalPath(value, field) {
  if (value === void 0)
    return void 0;
  if (typeof value !== "string" || value === "" || value.startsWith("-") || /[\0\r\n]/.test(value)) {
    throw new FliskError(`${field} must be a non-empty path that does not start with "-"`, [
      "Pass a path relative to projectPath, or an absolute path"
    ]);
  }
  return value;
}
function optionalPort(value, field) {
  if (value === void 0)
    return void 0;
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new FliskError(`${field} must be an integer from 1 to 65535`, [
      `Omit ${field} to take the next free port in the type's range`
    ]);
  }
  return value;
}
function parseObject(text) {
  try {
    const value = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
  } catch {
    return void 0;
  }
}
function toToolResult(run) {
  const lines = run.stdout.trim().split("\n");
  let envelope;
  for (let i = lines.length - 1; i >= 0 && !envelope; i--) {
    if (lines[i]?.startsWith("{"))
      envelope = parseObject(lines.slice(i).join("\n"));
  }
  const lastLine = lines.filter((line) => line.trim().startsWith("{")).pop();
  envelope ??= lastLine === void 0 ? void 0 : parseObject(lastLine);
  if (!lastLine) {
    return {
      data: {
        errors: [
          {
            code: "NO_JSON",
            message: run.stderr.trim() || `flisk exited with code ${run.exitCode}`
          }
        ]
      },
      isError: true
    };
  }
  if (!envelope) {
    return {
      data: { errors: [{ code: "BAD_JSON", message: lastLine.slice(0, 200) }] },
      isError: true
    };
  }
  const failed = (envelope.errors?.length ?? 0) > 0 || envelope.data?.ok === false || envelope.ok === false;
  return { data: envelope, isError: failed };
}
function toTextResult(run) {
  const stderr = run.stderr.trim();
  return {
    data: {
      exitCode: run.exitCode,
      output: run.stdout.trim(),
      ...stderr ? { stderr } : {}
    },
    isError: run.exitCode !== 0
  };
}
function readNativeUpSnapshot(projectDir, since) {
  const root = findProjectRoot(projectDir) ?? projectDir;
  const run = readNativeRunState(root);
  if (!run || !isProcessAlive(run.pid) || Date.parse(run.startedAt) < since - 1e3)
    return null;
  const services = nativeServiceStates(root, Object.keys(run.services));
  const logs = {};
  for (const [name, state] of Object.entries(services)) {
    if (state.status === "ready")
      continue;
    const [withLogs] = withFailureLogs(root, [{ name, reason: state.reason ?? state.status }], since);
    if (withLogs?.logs?.length)
      logs[name] = withLogs.logs;
  }
  return { services, logs };
}
function withUpState(result, state) {
  const envelope = result.data;
  if (!envelope || typeof envelope !== "object")
    return result;
  return {
    ...result,
    data: {
      ...envelope,
      data: { ...envelope.data ?? {}, state, ready: state === "ready" }
    }
  };
}
var defaultUpDeps = {
  spawnUp(args, logFile, cwd) {
    const fd = openSync(logFile, "a", 384);
    const [command, ...prefix] = cliInvocation();
    const child = spawn(command, [...prefix, ...args], {
      cwd,
      detached: true,
      stdio: ["ignore", fd, fd],
      env: { ...process.env, NO_COLOR: "1" }
    });
    closeSync(fd);
    return child;
  },
  readLog(logFile) {
    try {
      return readFileSync(logFile, "utf-8");
    } catch {
      return "";
    }
  },
  nativeSnapshot: readNativeUpSnapshot,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  logFile: () => join(tmpdir(), `flisk-mcp-up-${Date.now()}.log`)
};
function buildUpArgs(args) {
  const stack = optionalName(args.stack, "stack");
  const only = names(args.only, "only");
  const out = ["up"];
  if (stack)
    out.push(stack);
  if (only.length > 0)
    out.push(...only.map((name) => `--only=${name}`));
  if (flag(args.force, "force"))
    out.push("--force");
  if (flag(args.dryRun, "dryRun"))
    out.push("--dry-run");
  out.push("--json");
  return out;
}
async function startUp(args, deps = defaultUpDeps) {
  const argv = buildUpArgs(args);
  const logFile = deps.logFile();
  const child = deps.spawnUp(argv, logFile, projectPath(args.projectPath));
  let exited;
  child.once("exit", (code) => {
    exited = code;
  });
  let spawnError;
  child.once("error", (error) => {
    spawnError = error;
  });
  const waitForReady = flag(args.waitForReady, "waitForReady");
  const [defaultWait, maxWait] = waitForReady ? [120, 600] : [15, 60];
  const waitMs = typeof args.waitSeconds === "number" ? Math.min(Math.max(args.waitSeconds, 0), maxWait) * 1e3 : defaultWait * 1e3;
  const launchedAt = Date.now();
  const deadline = deps.now() + waitMs;
  for (; ; ) {
    if (spawnError) {
      return toToolResult({
        exitCode: 1,
        stdout: "",
        stderr: `Could not start flisk up: ${spawnError.message}`
      });
    }
    const log = deps.readLog(logFile);
    const line = log.split("\n").filter((l) => l.startsWith('{"schemaVersion"')).pop();
    if (line) {
      const result = toToolResult({
        exitCode: exited ?? null,
        stdout: line,
        stderr: ""
      });
      if (!result.isError) {
        try {
          rmSync(logFile, { force: true });
        } catch {
        }
      }
      const reported = result.data.data;
      if (result.isError)
        return withUpState(result, "failed");
      if (reported?.runtime !== "native" || reported.dryRun)
        return { ...result };
      if (!reported.alreadyRunning)
        return withUpState(result, "ready");
      const current = deps.nativeSnapshot?.(projectPath(args.projectPath) ?? process.cwd(), 0);
      const allReady = current !== null && current !== void 0 && Object.values(current.services).every((service) => service.status === "ready");
      if (allReady || !current)
        return withUpState(result, allReady ? "ready" : "starting");
      const starting = withUpState(result, "starting");
      const envelope = starting.data;
      return {
        ...starting,
        data: {
          ...envelope,
          data: { ...envelope.data, services: current.services, logs: current.logs }
        }
      };
    }
    if (exited !== void 0) {
      return withUpState(toToolResult({
        exitCode: exited,
        stdout: "",
        // Masked before it is cut, so the cut cannot shorten a secret out of recognition.
        stderr: redactProjectText(log, projectPath(args.projectPath)).slice(-2e3)
      }), "failed");
    }
    if (deps.now() >= deadline) {
      await new Promise((done) => setImmediate(done));
      if (spawnError)
        continue;
      break;
    }
    await deps.sleep(250);
  }
  child.unref();
  const snapshot = deps.nativeSnapshot?.(projectPath(args.projectPath) ?? process.cwd(), launchedAt);
  const progress = snapshot ? { services: snapshot.services, logs: snapshot.logs } : {};
  if (waitForReady) {
    const pending = snapshot ? Object.entries(snapshot.services).filter(([, service]) => service.status !== "ready").map(([name, service]) => `${name} (${service.reason ?? service.status})`) : [];
    return {
      data: createMachineEnvelope({
        ok: false,
        started: true,
        state: "timeout",
        ready: false,
        pid: child.pid ?? null,
        logFile,
        ...progress,
        next: "It is still starting and keeps running. Poll status until every service is ready, or call down to stop it. Next time pass a longer waitSeconds with waitForReady."
      }, [
        {
          code: "UP_NOT_READY_IN_TIME",
          message: `Not ready after ${Math.round(waitMs / 1e3)}s${pending.length > 0 ? `: ${pending.join(", ")}` : ""}.`
        }
      ]),
      isError: true
    };
  }
  return {
    data: createMachineEnvelope({
      ok: true,
      started: true,
      state: "starting",
      ready: false,
      pid: child.pid ?? null,
      logFile,
      ...progress,
      next: "Started, not confirmed ready. Poll the status tool until every service is ready (data.tilt.readiness.ready for Tilt), or pass waitForReady next time to wait for it. Call down to stop it."
    }),
    isError: false
  };
}
function buildLogsArgs(args) {
  const out = ["logs", "--json"];
  for (const name of names(args.services, "services"))
    out.push(`--service=${name}`);
  if (args.tail !== void 0) {
    if (!Number.isInteger(args.tail) || args.tail < 1) {
      throw new FliskError("tail must be a positive integer", [
        "Pass a whole number from 1 to 10000, or omit tail for the last 200 lines"
      ]);
    }
    out.push(`--tail=${args.tail}`);
  }
  if (args.since !== void 0) {
    if (typeof args.since !== "string" || !SINCE.test(args.since)) {
      throw new FliskError("since must be a duration such as 30s, 5m or 1h", [
        "Pass a number with a unit (ms, s, m, h), or omit since for all buffered logs"
      ]);
    }
    out.push(`--since=${args.since}`);
  }
  if (args.source !== void 0) {
    if (args.source !== "runtime" && args.source !== "build") {
      throw new FliskError("source must be runtime or build", [
        "Use runtime for what a service printed (crash causes), build for image build steps, or omit source for both"
      ]);
    }
    out.push(`--source=${args.source}`);
  }
  return out;
}
function buildToolAddArgs(args) {
  if (typeof args.tool !== "string" || !args.tool.trim()) {
    throw new FliskError("tool is required", [`Pass one of: ${toolIds().join(", ")}`]);
  }
  const tool = findTool(args.tool)?.id;
  if (!tool) {
    throw new FliskError(`Flisk does not know the tool "${args.tool}"`, [
      `Pass one of: ${toolIds().join(", ")}`
    ]);
  }
  const name = optionalName(args.name, "name");
  const stack = optionalName(args.stack, "stack");
  const dryRun = flag(args.dryRun, "dryRun");
  return [
    "tool",
    "add",
    tool,
    ...name ? [name] : [],
    "--json",
    ...stack ? [`--stack=${stack}`] : [],
    ...dryRun ? ["--dry-run"] : []
  ];
}
function buildResourceCreateArgs(args) {
  const name = optionalName(args.name, "name");
  if (!name) {
    throw new FliskError("name is required", ["Pass a kebab-case name, for example orders-api"]);
  }
  const type = optionalChoice(args.type, "type", RESOURCE_CREATE_TYPE_VALUES);
  const stack = optionalName(args.stack, "stack");
  const framework = optionalName(args.framework, "framework");
  const language = optionalName(args.language, "language");
  const port = optionalPort(args.port, "port");
  const features = names(args.features, "features");
  const runtime = optionalName(args.runtime, "runtime");
  const durability = optionalName(args.durability, "durability");
  const local = flag(args.local, "local");
  if (local && type && type !== "frontend" && type !== "backend") {
    throw new FliskError(`local applies to type frontend or backend, not ${type}`, [
      "Leave local out to scaffold it for Docker and Tilt"
    ]);
  }
  const out = ["resource", name];
  if (type)
    out.push(`--type=${type}`);
  if (stack)
    out.push(`--stack=${stack}`);
  if (framework)
    out.push(`--framework=${framework}`);
  if (language)
    out.push(`--language=${language}`);
  if (port !== void 0)
    out.push(`--port=${port}`);
  out.push(...features.map((feature) => `--feature=${feature}`));
  if (runtime)
    out.push(`--runtime=${runtime}`);
  if (durability)
    out.push(`--durability=${durability}`);
  if (local)
    out.push("--local");
  out.push("--yes");
  return out;
}
function buildStackAssignArgs(args) {
  const stack = optionalName(args.stack, "stack");
  if (!stack) {
    throw new FliskError("stack is required", ["Pass the kebab-case stack to assign them to"]);
  }
  const resources = names(args.resources, "resources");
  if (resources.length === 0) {
    throw new FliskError("resources must name at least one resource", [
      "resource_list shows each resource's stack; pass the names without one"
    ]);
  }
  return [
    "stack",
    stack,
    ...args.move === true ? ["--move"] : [],
    ...resources.map((resource) => `--resources=${resource}`),
    "--json"
  ];
}
function buildProjectInitArgs(args) {
  const template = optionalChoice(args.template, "template", Object.keys(PROJECT_TEMPLATES));
  const path = optionalPath(args.path, "path");
  if (path && !template) {
    throw new FliskError("path applies only with a template", ["Drop path, or pass template"]);
  }
  if (template && args.agentSkills !== void 0) {
    throw new FliskError("agentSkills applies only to a blank project, not to a template", [
      "Drop agentSkills, or omit template"
    ]);
  }
  const out = ["project"];
  if (template)
    out.push(template);
  if (path)
    out.push(`--path=${path}`);
  if (!flag(args.agentSkills, "agentSkills", true))
    out.push("--no-agent-skills");
  out.push("--yes");
  return out;
}
function buildConfigRegenerateArgs(args) {
  return flag(args.dryRun, "dryRun", true) ? ["config", "regenerate", "--dry-run", "--json"] : ["config", "regenerate", "--json"];
}
function buildProjectEjectArgs(args) {
  const dryRun = flag(args.dryRun, "dryRun");
  if (!dryRun && !flag(args.confirm, "confirm")) {
    throw new FliskError("project_eject writes EJECTED.md into the project; it needs confirm: true", [
      "Pass confirm: true to eject",
      "Pass dryRun: true to list the generated files and what would be written, without confirm"
    ]);
  }
  return dryRun ? ["eject", "--dry-run", "--json"] : ["eject", "--yes", "--json"];
}
function buildProjectImportArgs(args) {
  if (flag(args.force, "force") && !flag(args.dryRun, "dryRun") && !flag(args.confirm, "confirm")) {
    throw new FliskError("project_import with force overwrites existing service.json files; it needs confirm: true", [
      "Ask the user, then pass confirm: true together with force: true",
      "Pass dryRun: true to see the plan without confirm",
      "Drop force to import without overwriting an existing service.json"
    ]);
  }
  const dir = optionalPath(args.dir, "dir");
  const out = ["import"];
  if (dir)
    out.push(dir);
  if (flag(args.dryRun, "dryRun"))
    out.push("--dry-run");
  if (flag(args.force, "force"))
    out.push("--force");
  out.push("--json");
  return out;
}
var OBJECT = (properties) => ({
  type: "object",
  properties,
  additionalProperties: false
});
var PROJECT_PATH = {
  type: "string",
  description: "Absolute path to the Flisk project root; run this operation from that directory."
};
function projectPath(value) {
  if (value === void 0)
    return void 0;
  if (typeof value !== "string" || !isAbsolute(value)) {
    throw new FliskError("projectPath must be an absolute path to a Flisk project root", [
      "Pass the absolute path of the directory that holds .flisk/project.json",
      "Or omit projectPath to run in the MCP server's directory"
    ]);
  }
  const stat = statSync(value, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) {
    throw new FliskError(`projectPath does not exist or is not a directory: ${value}`, [
      "Create the directory, or pass the absolute path of an existing directory (for a project that is already set up, the one that holds .flisk/project.json)",
      "Or omit projectPath to run in the MCP server's directory"
    ]);
  }
  return value;
}
var READ_ONLY = {
  readOnlyHint: true,
  openWorldHint: false
};
var WRITES_LOCALLY = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false
};
var TOOL_ANNOTATIONS = {
  doctor: READ_ONLY,
  status: READ_ONLY,
  logs: READ_ONLY,
  resource_list: READ_ONLY,
  agent_list: READ_ONLY,
  agent_sessions: READ_ONLY,
  stack_list: READ_ONLY,
  project_info: READ_ONLY,
  project_templates: READ_ONLY,
  network_list: READ_ONLY,
  config_verify: READ_ONLY,
  config_explain: READ_ONLY,
  runtime_check: READ_ONLY,
  up: WRITES_LOCALLY,
  down: { ...WRITES_LOCALLY, destructiveHint: true, idempotentHint: true },
  resource_restart: WRITES_LOCALLY,
  // An arbitrary command in the resource's environment: it may change data or reach the network.
  resource_run: {
    ...WRITES_LOCALLY,
    destructiveHint: true,
    openWorldHint: true
  },
  // dryRun is the default; dryRun: false overwrites the generated files and discards hand edits in them.
  config_regenerate: {
    ...WRITES_LOCALLY,
    destructiveHint: true,
    idempotentHint: true
  },
  // Running it again on an existing resource rewrites its service.json.
  resource_create: { ...WRITES_LOCALLY, destructiveHint: true },
  // Runs resource_create's command, so adding a tool whose resource exists rewrites its service.json too.
  tool_add: { ...WRITES_LOCALLY, destructiveHint: true },
  stack_assign: { ...WRITES_LOCALLY, idempotentHint: true },
  project_init: { ...WRITES_LOCALLY, openWorldHint: true },
  project_eject: { ...WRITES_LOCALLY, idempotentHint: true },
  // force overwrites an existing service.json; the importer is fetched from npm.
  project_import: {
    ...WRITES_LOCALLY,
    destructiveHint: true,
    openWorldHint: true
  }
};
function restartCliTimeoutMs(cwd, resourceName, rebuild = false) {
  const root = findProjectRoot(cwd);
  if (!root)
    return resolveRestartCliTimeoutMs();
  try {
    clearDiscoveryResultCache(root);
    const { resources } = discoverResourcesWithProblems(root);
    const resource = resources.find((candidate) => candidate.name === resourceName);
    if (!resource)
      return resolveRestartCliTimeoutMs();
    if (!rebuild && isGeneratedComposeContainer(resource)) {
      const targets = [resource, ...collectSidecarDependents(resources, resourceName)];
      return resolveRestartSequenceCliTimeoutMs(targets.map((target) => target.config?.container?.stopGracePeriod));
    }
    return resolveRestartCliTimeoutMs(resource.config?.container?.stopGracePeriod);
  } catch {
    return resolveRestartCliTimeoutMs();
  }
}
function createFliskTools(run = runFliskCli, up = defaultUpDeps) {
  const viaCli = (build, options = {}) => async (args) => toToolResult(await run(build(args), {
    cwd: projectPath(args.projectPath),
    ...options
  }));
  const viaCliText = (build, options = {}) => async (args) => toTextResult(await run(build(args), {
    cwd: projectPath(args.projectPath),
    ...options
  }));
  const tools = [
    {
      name: "doctor",
      description: "Check whether this machine can run the Flisk stack (Docker, Tilt, ports). Read-only. Optionally set projectPath to include checks for a specific Flisk project. Returns data.ready and data.host.canUp; run it before `up`. For the state of a running stack use `status`; for whether generated files are consistent use `config_verify`.",
      inputSchema: OBJECT({
        projectPath: PROJECT_PATH,
        noPing: {
          type: "boolean",
          description: "Skip pinging running services' health endpoints"
        }
      }),
      handler: viaCli((args) => [
        "doctor",
        "--json",
        ...flag(args.noPing, "noPing") ? ["--no-ping"] : []
      ])
    },
    {
      name: "up",
      description: "Start the stack (or part of it) detached from the optional projectPath. The result carries `state`: `ready` (every local-process service passed its readiness check), `starting` (launched, readiness not confirmed: the default after a short wait; poll `status`, or pass waitForReady), `failed` (a service exited or gave up; the error carries its own output) or `timeout` (waitForReady was set and readiness was not reached in waitSeconds; it keeps starting). `started: true` never means ready. Fails fast on an unknown service, an unsupported host, or a Tilt already running.",
      inputSchema: OBJECT({
        projectPath: PROJECT_PATH,
        stack: { type: "string", description: "Only this stack" },
        only: {
          type: "array",
          items: { type: "string" },
          description: "Start only these services plus what they depend on and shared infrastructure"
        },
        force: {
          type: "boolean",
          description: "Replace a Tilt that is already running"
        },
        dryRun: {
          type: "boolean",
          description: "Show what would be started without starting"
        },
        waitForReady: {
          type: "boolean",
          description: "Wait until every service passed its readiness check (local-process stacks), instead of only watching for an early failure"
        },
        waitSeconds: {
          type: "number",
          description: "How long to wait before returning (default 15, max 60; with waitForReady default 120, max 600)"
        }
      }),
      handler: (args) => startUp(args, up)
    },
    {
      name: "down",
      description: "Stop the running stack, optionally selecting its project with projectPath. It stops the running services and does not edit the project's files. Use `status` first to see whether a stack is running, set dryRun to preview, and start it again with `up`.",
      inputSchema: OBJECT({
        projectPath: PROJECT_PATH,
        dryRun: {
          type: "boolean",
          description: "Show what would be stopped without stopping"
        }
      }),
      handler: viaCli((args) => [
        "down",
        "--json",
        ...flag(args.dryRun, "dryRun") ? ["--dry-run"] : []
      ])
    },
    {
      name: "status",
      description: "Show the live state of the stack: its stacks, resources, their ingress URLs and container ports, the stack-level ports, and Tilt readiness (data.tilt.readiness: ready, pending, failures, enabled; null when no Tilt answers). Read-only. Poll it after `up`. For the services a project defines whether or not they run use `resource_list`; for URLs only use `network_list`; for host checks use `doctor`. Optionally select the project with projectPath.",
      inputSchema: OBJECT({ projectPath: PROJECT_PATH }),
      handler: viaCli(() => ["status", "--json"])
    },
    {
      name: "logs",
      description: "A bounded snapshot of recent logs from the running stack (default the last 200 lines, at most 10000), returned as text. Read-only. Optionally select the project with projectPath. Not a stream: call it again for newer lines. Use `status` first to find which service is failing, then pass services to narrow the output and source `runtime` to skip image build output and read why it failed.",
      inputSchema: OBJECT({
        projectPath: PROJECT_PATH,
        services: {
          type: "array",
          items: { type: "string" },
          description: "Only these services"
        },
        tail: { type: "integer", minimum: 1, maximum: 1e4 },
        since: {
          type: "string",
          description: "Only logs newer than this, for example 30s, 5m, 1h"
        },
        source: {
          type: "string",
          enum: ["runtime", "build"],
          description: "runtime: only what the services printed (where a crash cause such as an exception or a missing variable is); build: only image build steps. Omit for both."
        }
      }),
      handler: viaCli(buildLogsArgs)
    },
    {
      name: "resource_list",
      description: "List the selected project's services (resources) with their stack, type and port, whether or not they are running. Read-only. Use `status` for live state, `stack_list` to group them by stack and `agent_list` for agents only. Set projectPath when the MCP server is not running from the project root.",
      inputSchema: OBJECT({
        projectPath: PROJECT_PATH,
        stack: { type: "string", description: "Only this stack" }
      }),
      handler: viaCli((args) => {
        const stack = optionalName(args.stack, "stack");
        return ["resources", "--json", ...stack ? [`--stack=${stack}`] : []];
      })
    },
    {
      name: "resource_restart",
      aliases: ["restart_resource"],
      description: "Restart one running resource in the stack along with any active container resources that transitively declare `sidecarOf` on it (Flisk-generated Compose containers restart without rebuilding their image; local-process resources of a project that runs without Tilt are restarted by the run that supervises them (its .env is re-read, only that service is stopped and started, and the result says whether it is `ready`, `failed` with its own output, or still starting); other non-container resources and projects using an imported Tiltfile fall back to `tilt trigger`); unrelated resources are not touched. It needs a running stack: start one with `up`. Set rebuild to true for a full Tilt update (rebuild the image and recreate the container, which re-reads the project .env). Names come from `resource_list`. Set projectPath when the MCP server is not running from the project root.",
      inputSchema: OBJECT({
        projectPath: PROJECT_PATH,
        resource: {
          type: "string",
          description: "Name of the resource to restart"
        },
        rebuild: {
          type: "boolean",
          description: "Rebuild the image and recreate the container through Tilt"
        },
        waitSeconds: {
          type: "number",
          description: "Local-process stacks: how long to wait for the service to be ready again (default 60, max 300; 0 returns once the restart has begun)"
        }
      }),
      handler: async (args) => {
        const resource = optionalName(args.resource, "resource");
        if (!resource) {
          throw new FliskError("resource is required", [
            "Pass the resource name; resource_list shows them"
          ]);
        }
        const cwd = projectPath(args.projectPath);
        const rebuild = flag(args.rebuild, "rebuild");
        const waitSeconds = typeof args.waitSeconds === "number" ? Math.min(Math.max(args.waitSeconds, 0), 300) : 60;
        const cliArgs = [
          "restart",
          resource,
          "--json",
          `--wait=${waitSeconds}`,
          ...rebuild ? ["--rebuild"] : []
        ];
        return toToolResult(await run(cliArgs, {
          cwd,
          // A local-process restart waits for readiness inside the command: allow for that wait.
          timeoutMs: Math.max(restartCliTimeoutMs(cwd, resource, rebuild), waitSeconds * 1e3 + 3e4)
        }));
      }
    },
    {
      name: "resource_run",
      description: "Run a one-off command (a seed script, a migration, a status check) with the environment one resource has in the stack, and return its exit code, stdout and stderr (the last 64 KB of each; values from the project's .env files are masked). It runs any command, so it is refused unless confirm is true: ask the user first. A container resource must be running (start it with `up`); a local-process resource runs from its folder. No input is passed. Names come from `resource_list`. Set projectPath when the MCP server is not running from the project root.",
      inputSchema: {
        ...OBJECT({
          projectPath: PROJECT_PATH,
          resource: {
            type: "string",
            description: "Name of the resource whose environment the command gets"
          },
          command: {
            type: "array",
            items: { type: "string" },
            description: 'The program and its arguments, for example ["node", "scripts/seed.js"]'
          },
          confirm: {
            type: "boolean",
            description: "Must be true to run the command: it runs arbitrary code in the resource's environment"
          }
        }),
        required: ["resource", "command"]
      },
      handler: viaCli((args) => {
        const resource = optionalName(args.resource, "resource");
        if (!resource) {
          throw new FliskError("resource is required", [
            "Pass the resource name; resource_list shows them"
          ]);
        }
        const command = Array.isArray(args.command) ? args.command.filter((part) => typeof part === "string") : [];
        if (command.length === 0) {
          throw new FliskError("command is required", [
            'Pass the program and its arguments, for example ["node", "scripts/seed.js"]'
          ]);
        }
        if (!flag(args.confirm, "confirm")) {
          throw new FliskError(`resource_run runs \`${command.join(" ")}\` in the ${resource} environment; it needs confirm: true`, [
            "Ask the user to approve this command, then call resource_run again with confirm: true",
            "For read-only inspection use status, logs or resource_list, which need no confirm"
          ]);
        }
        return ["run", resource, "--json", "--", ...command];
      })
    },
    {
      name: "agent_list",
      aliases: ["list_agents"],
      description: "List AI agent resources (appType: 'agent') in the project with their stack, runtime, durability and port. Read-only. Use `resource_list` for every resource type, and `agent_sessions` to inspect one agent's sessions. Set projectPath when the MCP server is not running from the project root.",
      inputSchema: OBJECT({
        projectPath: PROJECT_PATH,
        stack: { type: "string", description: "Only this stack" }
      }),
      handler: viaCli((args) => {
        const stack = optionalName(args.stack, "stack");
        return ["resources", "--type=agent", "--json", ...stack ? [`--stack=${stack}`] : []];
      })
    },
    {
      name: "agent_sessions",
      aliases: ["get_agent_sessions"],
      description: "List the sessions of a running AI agent resource (id, last activity, status, checkpoint size), or read one session's checkpoint when sessionId is set. Set projectPath when the MCP server is not running from the project root.",
      inputSchema: {
        ...OBJECT({
          projectPath: PROJECT_PATH,
          resource: {
            type: "string",
            description: "Name of the agent resource"
          },
          sessionId: {
            type: "string",
            description: "Session ID to read; omit it to list all sessions"
          }
        }),
        required: ["resource"]
      },
      handler: viaCli((args) => {
        const resource = optionalName(args.resource, "resource");
        if (!resource) {
          throw new FliskError("resource is required", [
            "Pass the agent resource name; agent_list shows them"
          ]);
        }
        const sessionId = optionalName(args.sessionId, "sessionId");
        return sessionId ? ["agent", "sessions", resource, `--session-id=${sessionId}`, "--json"] : ["agent", "sessions", resource, "--json"];
      })
    },
    {
      name: "stack_list",
      description: "List the project's stacks with their resource counts. Read-only. Use `resource_list` for the resources themselves. Set services to include each stack's service names, and verbose for its description. Set projectPath when the MCP server is not running from the project root.",
      inputSchema: OBJECT({
        projectPath: PROJECT_PATH,
        services: {
          type: "boolean",
          description: "Include the service names in each stack"
        },
        verbose: {
          type: "boolean",
          description: "Include each stack's description"
        }
      }),
      handler: viaCli((args) => [
        "stacks",
        "--json",
        ...flag(args.services, "services") ? ["--services"] : [],
        ...flag(args.verbose, "verbose") ? ["--verbose"] : []
      ])
    },
    {
      name: "project_info",
      description: "Project root, whether the generated master files exist (data.configured, data.missingFiles), and resource and stack counts. Read-only; a quick first call to learn whether a folder is a configured Flisk project. Use `config_verify` to check that the generated files match, and `status` for the running stack. Set projectPath when the MCP server is not running from the project root.",
      inputSchema: OBJECT({ projectPath: PROJECT_PATH }),
      handler: viaCli(() => ["projects", "--json"])
    },
    {
      name: "project_templates",
      description: "List the starter templates project_init can clone (data.templates): each one's key, repo, description and, for a template pinned to a commit, the ref it checks out. Read-only; the same rows as `flisk project --list --json`. Pass a key as project_init's template.",
      inputSchema: OBJECT({}),
      handler: async () => ({
        data: { templates: listProjectTemplates() },
        isError: false
      })
    },
    {
      name: "network_list",
      description: "The Traefik URL of every frontend and API service, with its base path, port and whether it answers (running, stopped). Read-only. Use it to find where to open a service; use `status` for full readiness. Set projectPath when the MCP server is not running from the project root.",
      inputSchema: OBJECT({
        projectPath: PROJECT_PATH,
        stack: { type: "string", description: "Only this stack" }
      }),
      handler: viaCli((args) => {
        const stack = optionalName(args.stack, "stack");
        return ["networks", "--json", ...stack ? [`--stack=${stack}`] : []];
      })
    },
    {
      name: "config_verify",
      description: "Check that the generated files match .flisk/project.json and that every service.json is valid. Returns data.valid, data.errors, data.warnings and data.diffs; a drifted generated file is fixed with config_regenerate. Set projectPath when the MCP server is not running from the project root.",
      inputSchema: OBJECT({ projectPath: PROJECT_PATH }),
      handler: viaCli(() => ["config", "verify", "--json"])
    },
    {
      name: "config_explain",
      description: "Explain one project file: whether Flisk generated it or the user owns it, its source, whether it is edited now, whether editing it blocks `up`, and what to edit instead. Run it before editing a file you did not write. Set projectPath when the MCP server is not running from the project root.",
      inputSchema: {
        ...OBJECT({
          projectPath: PROJECT_PATH,
          file: {
            type: "string",
            description: "The file, relative to projectPath (or to the server's directory) or absolute; it must be inside the project"
          }
        }),
        required: ["file"]
      },
      handler: viaCli((args) => {
        const file = optionalPath(args.file, "file");
        if (!file) {
          throw new FliskError("file is required", [
            "Pass the project file to explain, for example .flisk/.flisk-out/Tiltfile"
          ]);
        }
        return ["config", "explain", file, "--json"];
      })
    },
    {
      name: "runtime_check",
      description: "Read-only. Check that the installed Flisk CLI has its bundled runtime assets (engine, templates). Returns ok, assetRoot and what is missing; a source checkout reports ok: false because the assets exist only in a packaged install. projectPath is optional: a project-local install under its node_modules is checked too.",
      inputSchema: OBJECT({ projectPath: PROJECT_PATH }),
      handler: viaCli(() => ["runtime", "--check-assets", "--json"])
    },
    {
      name: "config_regenerate",
      description: "Regenerate the master config files in .flisk/.flisk-out/ from .flisk/project.json. A dry run by default, which returns the planned changes as data.changes (each file's status and lineDiff) with data.hasChanges; set dryRun to false to write them and get the same list, which discards hand edits in those generated files. Set projectPath when the MCP server is not running from the project root.",
      inputSchema: OBJECT({
        projectPath: PROJECT_PATH,
        dryRun: {
          type: "boolean",
          description: "Default true: show what would change. false rewrites the files and discards hand edits in them"
        }
      }),
      handler: viaCli(buildConfigRegenerateArgs)
    },
    {
      name: "resource_create",
      description: "Scaffold a new service (service.json, Dockerfile, source and a test) with `flisk resource <name> --yes`, or register an existing directory that already has a service.json. Returns the command's text output. Without stack it uses the only existing stack or `main`, and fails when several stacks exist. Do not call it again for a resource that already exists: that rewrites its service.json and can assign it a new port (check with resource_list first). Call `up` afterwards to start it. Set projectPath when the MCP server is not running from the project root.",
      inputSchema: {
        ...OBJECT({
          projectPath: PROJECT_PATH,
          name: { type: "string", description: "Resource name (kebab-case)" },
          type: {
            type: "string",
            enum: [...RESOURCE_CREATE_TYPE_VALUES],
            description: "Resource type (default backend). Redis, Qdrant, MinIO, MLflow, MySQL, MongoDB, ClickHouse, NATS, RabbitMQ, Mailpit and stripe-mock are frameworks: type database, queue, storage, mail or payment plus framework"
          },
          stack: {
            type: "string",
            description: "Stack to assign the resource to"
          },
          framework: {
            type: "string",
            description: "Frontend: react (default), vue, svelte, preact, lit, solid, qwik, vanilla, tanstack-router, next. Backend: hono (default), express, elysia, fastify, nestjs, koa, h3. Database: postgres (default, the shared Flisk Postgres), redis, qdrant, mlflow, mysql, mongodb, clickhouse (each its own container; the services that list it in dependsOn get its connection settings). Queue: nats (default), rabbitmq. Storage: minio (default). Mail: mailpit (default, local SMTP and inbox). Payment: stripe-mock (default, Stripe API emulator)"
          },
          language: {
            type: "string",
            description: "Backend language: bun (default), python, go, rust, node"
          },
          port: {
            type: "integer",
            minimum: 1,
            maximum: 65535,
            description: "Port within the type's range (default: the next free one)"
          },
          features: {
            type: "array",
            items: { type: "string" },
            description: "Resource features to enable, for example prisma or drizzle"
          },
          runtime: {
            type: "string",
            description: "Agent runtime (type agent only): custom"
          },
          durability: {
            type: "string",
            description: "Where agent sessions are checkpointed (type agent only): files or postgres"
          },
          local: {
            type: "boolean",
            description: "Frontend or backend only: scaffold it to run on this computer with no Docker or Tilt (a plain Vite config, a command in service.json), the way flisk create does by default"
          }
        }),
        required: ["name"]
      },
      handler: viaCliText(buildResourceCreateArgs)
    },
    {
      name: "tool_add",
      description: "Add a tool by its everyday name (react, nextjs, fastapi, nodejs, postgresql, mysql, mongodb, rag, embeddings, llm-api) with `flisk tool add <tool> --json`, which runs the matching `flisk resource` command. data.status says what happened: resource (created; data.resource is the resource_create result), built-in (docker: nothing to do), manual (angular, tailwind, spring-boot, github-actions, jutro, policycenter: data.steps are steps to show the user; nothing was changed), or an error for a rejected tool (aws, google-cloud, azure, kubernetes): Flisk runs everything locally and never creates cloud resources, so do not work around it. Call `up` afterwards to start a new resource. Set projectPath when the MCP server is not running from the project root.",
      inputSchema: {
        ...OBJECT({
          projectPath: PROJECT_PATH,
          tool: {
            type: "string",
            description: `The tool to add, by id or everyday name ("Next.js", "google cloud"): ${toolIds().join(", ")}`
          },
          name: {
            type: "string",
            description: "Resource name (default per tool, for example web, server, db); a name already in use is refused"
          },
          stack: {
            type: "string",
            description: "Stack to assign the resource to"
          },
          dryRun: {
            type: "boolean",
            description: "Preview the resource without writing files or reserving a port"
          }
        }),
        required: ["tool"]
      },
      handler: viaCli(buildToolAddArgs)
    },
    {
      name: "stack_assign",
      description: "Assign resources that have no stack yet to a stack (writes `stack` into their service.json). A resource already in a stack is refused unless move is true, which moves it out of its current stack. Returns the structured envelope: data.stack and data.assigned (name and service.json path of each resource), or errors with a code and suggestions (for example the valid resource names). Set projectPath when the MCP server is not running from the project root.",
      inputSchema: {
        ...OBJECT({
          projectPath: PROJECT_PATH,
          stack: { type: "string", description: "Stack name (kebab-case)" },
          resources: {
            type: "array",
            items: { type: "string" },
            description: "Names of the resources to assign"
          },
          move: {
            type: "boolean",
            description: "Move resources that are already in another stack instead of refusing them"
          }
        }),
        required: ["stack", "resources"]
      },
      handler: viaCli(buildStackAssignArgs)
    },
    {
      name: "project_init",
      description: "Create a Flisk project with `flisk project --yes`: in projectPath (an existing directory; default the server's directory) write .flisk/project.json and generate its files, or, with template, clone a starter project into a new directory there (then call project_init again with projectPath set to the clone to configure it). Inside an existing project it refreshes that project's generated files instead and never overwrites its project.json. Returns the command's text output.",
      inputSchema: OBJECT({
        projectPath: {
          type: "string",
          description: "Absolute path to an existing directory to create the project in (or to clone the template from)"
        },
        template: {
          type: "string",
          enum: Object.keys(PROJECT_TEMPLATES),
          description: "Clone this starter project instead of creating a blank one"
        },
        path: {
          type: "string",
          description: "Template only: directory to clone into, relative to projectPath or absolute (default: the starter name, or its repository name)"
        },
        agentSkills: {
          type: "boolean",
          description: "Blank project only: write the Flisk agent skills and AGENTS.md (default true)"
        }
      }),
      handler: viaCliText(buildProjectInitArgs, {
        timeoutMs: PROJECT_INIT_TIMEOUT_MS
      })
    },
    {
      name: "project_eject",
      description: "Write EJECTED.md with `flisk eject --json`: it lists the generated Tilt files and how to run the stack with plain Tilt, and copies, moves or deletes nothing. It changes the project, so it is refused unless confirm is true; dryRun returns the plan (data.generatedFiles, data.created) without confirm. Set projectPath when the MCP server is not running from the project root.",
      inputSchema: OBJECT({
        projectPath: PROJECT_PATH,
        confirm: {
          type: "boolean",
          description: "Must be true to write EJECTED.md; without it only a dry run is allowed"
        },
        dryRun: {
          type: "boolean",
          description: "List the generated files and what would be written, without writing"
        }
      }),
      handler: viaCli(buildProjectEjectArgs)
    },
    {
      name: "project_import",
      description: "Import the services in a directory's root docker-compose.yml as bring-your-own service.json files with `flisk import --json`, which runs the pinned flisk-import from npm (the first run needs network access). It writes without asking: set dryRun to get the plan only, and force to overwrite an existing service.json (force needs confirm: true unless dryRun is set). Returns data.written and the importer's output. Set projectPath when the MCP server is not running from the project root.",
      inputSchema: OBJECT({
        projectPath: PROJECT_PATH,
        dir: {
          type: "string",
          description: "Directory with the docker-compose.yml, relative to projectPath or absolute (default: projectPath)"
        },
        dryRun: {
          type: "boolean",
          description: "Print the plan and write nothing"
        },
        force: {
          type: "boolean",
          description: "Overwrite an existing service.json"
        },
        confirm: {
          type: "boolean",
          description: "Must be true together with force (unless dryRun) to overwrite files"
        }
      }),
      handler: viaCli(buildProjectImportArgs, { timeoutMs: IMPORT_TIMEOUT_MS })
    }
  ];
  return tools.map((tool) => ({
    ...tool,
    annotations: TOOL_ANNOTATIONS[tool.name],
    handler: async (args) => {
      const result = await tool.handler(args);
      const secrets = projectSecretValues(projectPath(args.projectPath));
      return {
        ...result,
        data: secrets === null ? { errors: [{ code: "ENV_UNREADABLE", message: OUTPUT_WITHHELD }] } : redactValue(result.data, secrets),
        ...secrets === null ? { isError: true } : {}
      };
    }
  }));
}

// dist/commands/mcp-check.js
import { Command } from "commander";

// dist/utils/mcp-check.js
var ACCEPT = "application/json, text/event-stream";
var PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
var PROTOCOL_VERSION = "2025-03-26";
var MAX_DETAIL = 400;
var MAX_SCHEMA_DEPTH = 6;
function asObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}
function asArray(value) {
  return Array.isArray(value) ? value : [];
}
function clip(text) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_DETAIL ? `${flat.slice(0, MAX_DETAIL - 1)}\u2026` : flat;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function parseRpcBody(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      return asObject(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.startsWith("data:"))
      continue;
    try {
      const message = asObject(JSON.parse(line.slice(5).trim()));
      if ("result" in message || "error" in message)
        return message;
    } catch {
    }
  }
  return null;
}
function sampleString(schema) {
  const format = typeof schema.format === "string" ? schema.format : "";
  let value = "example";
  if (format === "uri" || format === "url")
    value = "https://example.com";
  else if (format === "email")
    value = "user@example.com";
  else if (format === "date")
    value = "2026-01-01";
  else if (format === "date-time")
    value = "2026-01-01T00:00:00Z";
  const minLength = typeof schema.minLength === "number" ? schema.minLength : 0;
  if (value.length < minLength)
    value = value.padEnd(minLength, "x");
  const maxLength = typeof schema.maxLength === "number" ? schema.maxLength : void 0;
  return maxLength !== void 0 ? value.slice(0, maxLength) : value;
}
function sampleNumber(schema, isInteger) {
  let value = 1;
  if (typeof schema.minimum === "number")
    value = schema.minimum;
  else if (typeof schema.exclusiveMinimum === "number")
    value = schema.exclusiveMinimum + 1;
  if (typeof schema.maximum === "number" && value > schema.maximum)
    value = schema.maximum;
  return isInteger ? Math.ceil(value) : value;
}
function sampleValue(schemaInput, depth = 0) {
  const schema = asObject(schemaInput);
  if ("const" in schema)
    return schema.const;
  if ("default" in schema)
    return schema.default;
  if (Array.isArray(schema.examples) && schema.examples.length > 0)
    return schema.examples[0];
  if (Array.isArray(schema.enum) && schema.enum.length > 0)
    return schema.enum[0];
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    const options = asArray(schema[key]).filter((option) => asObject(option).type !== "null");
    if (options.length > 0)
      return sampleValue(options[0], depth);
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const type = types.find((candidate) => typeof candidate === "string" && candidate !== "null");
  if (type === "string")
    return sampleString(schema);
  if (type === "integer" || type === "number")
    return sampleNumber(schema, type === "integer");
  if (type === "boolean")
    return true;
  if (type === "array") {
    const count = typeof schema.minItems === "number" ? schema.minItems : 0;
    if (depth >= MAX_SCHEMA_DEPTH)
      return [];
    return Array.from({ length: count }, () => sampleValue(schema.items, depth + 1));
  }
  if (type === "object" || "properties" in schema) {
    return depth >= MAX_SCHEMA_DEPTH ? {} : buildSampleArguments(schema, depth + 1);
  }
  return "example";
}
function buildSampleArguments(schemaInput, depth = 0) {
  const schema = asObject(schemaInput);
  const properties = asObject(schema.properties);
  const required = asArray(schema.required).filter((name) => typeof name === "string");
  const out = {};
  for (const name of required)
    out[name] = sampleValue(properties[name], depth);
  return out;
}
function buildPromptArguments(argumentsList) {
  const out = {};
  for (const argument of asArray(argumentsList)) {
    const { name, required } = asObject(argument);
    if (typeof name === "string" && required === true)
      out[name] = "example";
  }
  return out;
}
function iconUrlFor(url) {
  return new URL("icon-512.png", url).toString();
}
function isPng(body) {
  return PNG_SIGNATURE.every((byte, index) => body[index] === byte);
}
function isLoopbackHost(hostname) {
  const host = hostname.toLowerCase();
  return host === "localhost" || host.endsWith(".localhost") || host === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(host);
}
function isFinalNetworkError(target, error) {
  const codes = [
    error?.code,
    error?.cause?.code
  ];
  if (!codes.some((code) => code === "ECONNREFUSED" || code === "ConnectionRefused"))
    return false;
  try {
    return isLoopbackHost(new URL(target).hostname);
  } catch {
    return false;
  }
}
var McpProbe = class {
  url;
  options;
  sessionId = null;
  nextId = 1;
  constructor(url, options) {
    this.url = url;
    this.options = options;
  }
  async http(target, request = {}) {
    const method = request.method ?? "POST";
    const headers = { "user-agent": this.options.userAgent };
    if (method === "POST")
      headers["content-type"] = "application/json";
    const accept = request.accept === void 0 ? ACCEPT : request.accept;
    if (accept !== null)
      headers.accept = accept;
    if (this.sessionId && target === this.url)
      headers["mcp-session-id"] = this.sessionId;
    let lastError = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0)
        await sleep(this.options.retryDelayMs);
      try {
        const response = await fetch(target, {
          method,
          headers,
          body: method === "POST" ? request.body : void 0,
          redirect: "follow",
          signal: AbortSignal.timeout(this.options.timeoutMs)
        });
        return {
          status: response.status,
          contentType: response.headers.get("content-type") ?? "",
          body: Buffer.from(await response.arrayBuffer()),
          sessionId: response.headers.get("mcp-session-id")
        };
      } catch (error) {
        const cause = error.cause;
        lastError = `${error instanceof Error ? error.message : String(error)}${cause?.code ? ` (${cause.code})` : cause?.message ? ` (${cause.message})` : ""}`;
        if (isFinalNetworkError(target, error))
          break;
      }
    }
    return { status: 0, contentType: "", body: Buffer.alloc(0), sessionId: null, error: lastError };
  }
  async rpc(method, params, request = {}) {
    const message = { jsonrpc: "2.0", id: this.nextId++, method };
    if (params !== void 0)
      message.params = params;
    const response = await this.http(this.url, { ...request, body: JSON.stringify(message) });
    if (method === "initialize" && response.sessionId)
      this.sessionId = response.sessionId;
    return {
      status: response.status,
      message: parseRpcBody(response.body.toString("utf8")),
      error: response.error
    };
  }
  async notify(method) {
    await this.http(this.url, { body: JSON.stringify({ jsonrpc: "2.0", method }) });
  }
};
function statusText(response) {
  return response.status === 0 ? `no answer: ${response.error ?? "network error"}` : `status ${response.status}`;
}
async function runMcpCheck(url, options = {}) {
  const probe = new McpProbe(url, {
    userAgent: options.userAgent ?? "flisk-mcp-check (+https://flisk.sh)",
    timeoutMs: options.timeoutMs ?? 3e4,
    retryDelayMs: options.retryDelayMs ?? 1e3
  });
  const checks = [];
  const add = (check, didPass, detail) => {
    checks.push({ check, didPass, detail: clip(detail) });
  };
  const skip = (check, detail) => {
    checks.push({ check, didPass: true, isSkipped: true, detail });
  };
  const iconUrl = options.icon === false ? null : iconUrlFor(url);
  const init = await probe.rpc("initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "flisk-mcp-check", version: "1" }
  });
  const initResult = asObject(init.message?.result);
  const capabilities = asObject(initResult.capabilities);
  const serverName = asObject(initResult.serverInfo).name;
  const hasPrompts = "prompts" in capabilities;
  add("initialize", init.status === 200 && typeof serverName === "string" && serverName !== "" && "tools" in capabilities, `${statusText(init)}, server ${typeof serverName === "string" ? serverName : "(none)"}, capabilities [${Object.keys(capabilities).join(", ")}]`);
  if (init.status === 0) {
    return finish(url, iconUrl, null, checks);
  }
  await probe.notify("notifications/initialized");
  const toolsList = await probe.rpc("tools/list");
  const toolsValue = asObject(toolsList.message?.result).tools;
  const tools = asArray(toolsValue).map(asObject);
  const toolNames = tools.map((tool) => String(tool.name ?? "(unnamed)"));
  add("tools/list", toolsList.status === 200 && Array.isArray(toolsValue), `${statusText(toolsList)}, tools [${toolNames.join(", ")}]`);
  for (const [index, tool] of tools.entries()) {
    const readOnly = asObject(tool.annotations).readOnlyHint;
    add(`readOnlyHint ${toolNames[index]}`, readOnly === true, `readOnlyHint=${String(readOnly)}`);
  }
  if (!options.call) {
    if (tools.length > 0) {
      skip("tools/call", "not run: pass --call to call each tool once (a call can reach the network)");
    }
  } else {
    for (const [index, tool] of tools.entries()) {
      const args = buildSampleArguments(tool.inputSchema);
      const call = await probe.rpc("tools/call", { name: toolNames[index], arguments: args });
      const result = asObject(call.message?.result);
      const content = asArray(result.content);
      const text = String(asObject(content[0]).text ?? "");
      const rpcError = call.message?.error;
      add(`tools/call ${toolNames[index]}`, call.status === 200 && !rpcError && result.isError !== true && content.length > 0, `${statusText(call)}, arguments ${JSON.stringify(args)}, ${rpcError ? `error ${JSON.stringify(rpcError)}` : `isError ${String(result.isError ?? false)}, text ${text}`}`);
    }
  }
  const promptsList = await probe.rpc("prompts/list");
  const promptsValue = asObject(promptsList.message?.result).prompts;
  const prompts = asArray(promptsValue).map(asObject);
  const promptNames = prompts.map((prompt) => String(prompt.name ?? "(unnamed)"));
  if (hasPrompts) {
    add("prompts/list", promptsList.status === 200 && Array.isArray(promptsValue), `${statusText(promptsList)}, prompts [${promptNames.join(", ")}]`);
  } else {
    const isRefused = promptsList.message !== null && "error" in promptsList.message;
    add("prompts/list", promptsList.message !== null && (isRefused || prompts.length === 0), isRefused ? `no prompts capability; refused with ${JSON.stringify(promptsList.message?.error)}` : `no prompts capability; ${statusText(promptsList)}, prompts [${promptNames.join(", ")}]${prompts.length > 0 ? ", but initialize did not declare prompts" : ""}`);
  }
  for (const [index, prompt] of prompts.entries()) {
    const args = buildPromptArguments(prompt.arguments);
    const get2 = await probe.rpc("prompts/get", { name: promptNames[index], arguments: args });
    const messages = asArray(asObject(get2.message?.result).messages);
    add(`prompts/get ${promptNames[index]}`, get2.status === 200 && messages.length > 0, `${statusText(get2)}, arguments ${JSON.stringify(args)}, ${messages.length} message(s)${get2.message?.error ? `, error ${JSON.stringify(get2.message.error)}` : ""}`);
  }
  const unknown = await probe.rpc("no/such_method");
  const unknownError = asObject(unknown.message?.error);
  add("unknown method is refused (-32601)", unknownError.code === -32601, unknown.message?.error ? JSON.stringify(unknown.message.error) : `${statusText(unknown)}, no JSON-RPC error`);
  const badJson = await probe.http(url, { body: "not json" });
  add("bad JSON is refused (HTTP 400)", badJson.status === 400, `${statusText(badJson)} ${badJson.body.toString("utf8").slice(0, 120)}`);
  const get = await probe.http(url, { method: "GET", accept: null });
  add("GET is refused (HTTP 405)", get.status === 405, statusText(get));
  const jsonOnly = await probe.rpc("tools/list", void 0, { accept: "application/json" });
  add("a JSON-only Accept header is served (not 406)", jsonOnly.status !== 406 && jsonOnly.status !== 0, statusText(jsonOnly));
  if (iconUrl) {
    const icon = await probe.http(iconUrl, { method: "GET", accept: null });
    add("icon-512.png is a PNG", icon.status === 200 && isPng(icon.body), `${iconUrl}: ${statusText(icon)}, ${icon.contentType || "no content-type"}${icon.status === 200 && !isPng(icon.body) ? ", not PNG bytes" : ""}`);
  }
  return finish(url, iconUrl, typeof serverName === "string" ? serverName : null, checks);
}
function finish(url, iconUrl, serverName, checks) {
  const failures = checks.filter((check) => !check.didPass).length;
  return { url, iconUrl, serverName, didPass: failures === 0, failures, checks };
}

// dist/commands/mcp-check.js
function isLoopbackHost2(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" || /^127\.\d+\.\d+\.\d+$/.test(host);
}
function parseTargetUrl(target) {
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    throw new FliskError(`"${target}" is not a valid URL`, ["Pass the full endpoint, such as https://mcp.example.com/mcp, or a resource name"], 2);
  }
  if (parsed.protocol === "https:" || parsed.protocol === "http:" && isLoopbackHost2(parsed.hostname)) {
    return parsed.toString();
  }
  throw new FliskError(`flisk mcp check needs an https URL, got ${parsed.protocol}//${parsed.host}`, [
    "Use the https address of the server",
    "Plain http is accepted only for localhost, *.localhost and loopback addresses"
  ], 2);
}
async function resolveResourceUrl(name) {
  const projectRoot = findProjectRoot();
  if (!projectRoot)
    throw errorFactories.notInProject();
  const { resources } = createDiscoveryContext();
  const resource = resources.find((candidate) => candidate.name === name);
  if (!resource) {
    const validNames = resources.map((candidate) => candidate.name);
    throw new FliskError(`No resource named "${name}"`, [
      ...validNames.length > 0 ? [`Valid resources: ${validNames.join(", ")}`] : ["This project has no resources yet"],
      "Run `flisk resources` to list all resources"
    ]);
  }
  let ingressHttp;
  try {
    ingressHttp = (await getHostPortPlan(projectRoot, { inspectDocker: false })).ingressHttp;
  } catch {
    ingressHttp = void 0;
  }
  const native = isNativeProject(resources);
  const ports = buildServicePorts(resource, ingressHttp, { native });
  const url = native ? ports.directUrl : ports.url;
  if (!url) {
    throw new FliskError(`Resource "${name}" has no HTTP route, so it cannot serve MCP`, [
      "Create an MCP server with `flisk resource <name> --type mcp`",
      "Or pass the server's URL instead of a resource name"
    ], 2);
  }
  return `${url.replace(/\/+$/, "")}/mcp`;
}
async function resolveMcpCheckTarget(target) {
  if (target.includes("://"))
    return { url: parseTargetUrl(target), resource: null };
  return { url: await resolveResourceUrl(target), resource: target };
}
function printReport(report, target) {
  const heading = target.resource ? `${target.resource} (${report.url})` : report.url;
  console.log(source_default.bold(`MCP check: ${heading}`));
  if (report.serverName)
    console.log(source_default.gray(`Server: ${report.serverName}`));
  console.log();
  const width = Math.max(5, ...report.checks.map((check) => check.check.length));
  console.log(source_default.bold(`  ${"Result".padEnd(6)}  ${"Check".padEnd(width)}  Detail`));
  for (const check of report.checks) {
    let label = source_default.green("pass".padEnd(6));
    if (check.isSkipped)
      label = source_default.gray("skip".padEnd(6));
    else if (!check.didPass)
      label = source_default.red("FAIL".padEnd(6));
    console.log(`  ${label}  ${check.check.padEnd(width)}  ${source_default.gray(check.detail)}`);
  }
  console.log();
  const total = report.checks.filter((check) => !check.isSkipped).length;
  const summary = `${total - report.failures} of ${total} checks passed`;
  console.log(report.didPass ? source_default.green(summary) : source_default.red(`${summary}, ${report.failures} failed`));
}
function createMcpCheckCommand() {
  return new Command("check").description("Check an MCP server's protocol (initialize, tools, prompts, errors, HTTP rules, icon); read-only unless --call").argument("<target>", "An https URL of the MCP endpoint, or the name of a resource in this project").option("--call", "Also call each tool once with sample arguments (a call can reach the network)", false).option("--no-icon", "Skip the icon-512.png check").option("--json", "Print the report as a JSON envelope", false).action(async (targetArg, options) => {
    const run = async () => {
      const target = await resolveMcpCheckTarget(targetArg);
      const report = await runMcpCheck(target.url, {
        call: options.call === true,
        icon: options.icon !== false,
        userAgent: `flisk-mcp-check/${getPackageVersion()} (+https://flisk.sh)`
      });
      return { report, target };
    };
    if (options.json) {
      let outcome;
      try {
        outcome = await run();
      } catch (error) {
        writeMachineError(error);
      }
      const { report, target } = outcome;
      const errors = report.didPass ? [] : [
        {
          code: "MCP_CHECK_FAILED",
          message: `${report.failures} MCP check(s) failed for ${report.url}`,
          suggestions: report.checks.filter((check) => !check.didPass).map((check) => `${check.check}: ${check.detail}`)
        }
      ];
      console.log(JSON.stringify(createMachineEnvelope({ resource: target.resource, ...report }, errors)));
      if (!report.didPass)
        process.exitCode = 1;
      return;
    }
    await runCommand(async () => {
      const { report, target } = await run();
      printReport(report, target);
      if (!report.didPass)
        process.exitCode = 1;
    });
  });
}

// dist/commands/mcp.js
var mcpCommand = new Command2("mcp").description("Run a Model Context Protocol server over stdio for coding agents").addCommand(createMcpCheckCommand()).option("--read-only", "List and allow only the tools that change nothing (env FLISK_MCP_READ_ONLY=1)").option("--tools <names>", "List and allow only these comma-separated tools (env FLISK_MCP_TOOLS)").addHelpText("after", [
  "",
  "The server reads JSON-RPC on stdin and waits for a client, so it prints nothing in a terminal.",
  "Add it to an MCP client instead:",
  '  { "command": "flisk", "args": ["mcp"] }',
  "",
  "Examples:",
  "  flisk mcp                # started by an MCP client",
  "  flisk mcp --read-only    # for a reviewer or CI agent: doctor, status, logs and the other read tools only",
  "  flisk mcp --tools status,logs,doctor",
  "  flisk mcp check tools    # check the MCP resource named tools"
].join("\n")).action(async (options) => {
  const tools = createFliskTools();
  const server = createMcpServer(tools, {
    name: "flisk",
    version: getPackageVersion(),
    icons: [
      { src: "https://mcp.flisk.sh/icon-512.png", mimeType: "image/png", sizes: ["512x512"] }
    ]
  }, resolveToolPolicy(tools, options));
  const lines = createInterface({ input: process.stdin });
  const pending = /* @__PURE__ */ new Set();
  lines.on("line", (line) => {
    const task = server.handleLine(line).then((response) => {
      if (response)
        process.stdout.write(`${response}
`);
    });
    pending.add(task);
    void task.finally(() => pending.delete(task));
  });
  await new Promise((resolve) => lines.once("close", resolve));
  await Promise.allSettled(pending);
});

export {
  mcpCommand
};
