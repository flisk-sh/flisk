// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { CREATABLE_RESOURCE_TYPES } from "../types/index.js";
import { FliskError } from "../utils/errors.js";
import { createMachineEnvelope } from "../utils/machine-output.js";
import { PROJECT_TEMPLATES } from "../utils/project-templates.js";
/** A service or stack name. A leading "-" is rejected so a value can never be read as a flag. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SINCE = /^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$/;
/** Cloning a starter repository can outlast the default two minutes. */
const PROJECT_INIT_TIMEOUT_MS = 300_000;
/** `flisk import` fetches flisk-import through npx first, which can outlast the default two minutes too. */
const IMPORT_TIMEOUT_MS = 300_000;
/**
 * How to run this CLI again: `node <script>` / `bun <script>` when started from a script, or the executable alone when it is
 * a `bun build --compile` binary, whose argv[1] is a virtual path that exists only inside the binary.
 */
export function cliInvocation(execPath = process.execPath, script = process.argv[1], fileExists = existsSync) {
    if (!script || script.startsWith("/$bunfs/") || script.includes("~BUN") || !fileExists(script)) {
        return [execPath];
    }
    return [execPath, script];
}
/** Runs this same CLI (`flisk <args>`) so every tool behaves exactly like its command. */
export const runFliskCli = (args, options = {}) => new Promise((resolve, reject) => {
    const [command, ...prefix] = cliInvocation();
    const child = spawn(command, [...prefix, ...args], {
        cwd: options.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, NO_COLOR: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
    });
    const timer = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs ?? 120_000);
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
    if (value === undefined)
        return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !NAME.test(item))) {
        throw new FliskError(`${field} must be an array of names (letters, digits, ".", "_", "-")`, [
            `Pass ${field} as an array of names, for example ["orders-api"]`,
        ]);
    }
    return value;
}
function optionalName(value, field) {
    if (value === undefined)
        return undefined;
    if (typeof value !== "string" || !NAME.test(value)) {
        throw new FliskError(`${field} must be a name (letters, digits, ".", "_", "-")`, [
            `Pass ${field} as a name that does not start with "-", for example orders-api`,
        ]);
    }
    return value;
}
function flag(value, field, fallback = false) {
    if (value === undefined)
        return fallback;
    if (typeof value !== "boolean") {
        throw new FliskError(`${field} must be a boolean`, [
            `Pass true or false, or omit ${field} for ${fallback}`,
        ]);
    }
    return value;
}
/** One of a fixed set of values, such as a resource type or a template name. */
function optionalChoice(value, field, choices) {
    if (value === undefined)
        return undefined;
    if (typeof value !== "string" || !choices.includes(value)) {
        throw new FliskError(`${field} must be one of: ${choices.join(", ")}`, [
            `Omit ${field} to use the command's default`,
        ]);
    }
    return value;
}
/** A file or directory path. A leading "-" is rejected so a positional path can never be read as a flag. */
function optionalPath(value, field) {
    if (value === undefined)
        return undefined;
    if (typeof value !== "string" ||
        value === "" ||
        value.startsWith("-") ||
        /[\0\r\n]/.test(value)) {
        throw new FliskError(`${field} must be a non-empty path that does not start with "-"`, [
            "Pass a path relative to projectPath, or an absolute path",
        ]);
    }
    return value;
}
function optionalPort(value, field) {
    if (value === undefined)
        return undefined;
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
        throw new FliskError(`${field} must be an integer from 1 to 65535`, [
            `Omit ${field} to take the next free port in the type's range`,
        ]);
    }
    return value;
}
function parseObject(text) {
    try {
        const value = JSON.parse(text);
        return typeof value === "object" && value !== null && !Array.isArray(value)
            ? value
            : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Turn a command's `--json` stdout into a tool result. A parseable envelope with errors, or `ok: false` (in `data`, or at
 * the top level for `runtime --check-assets --json`, which prints no envelope), is an error result.
 */
export function toToolResult(run) {
    const lines = run.stdout.trim().split("\n");
    // The envelope ends stdout, on one line or pretty-printed from a "{" at column 0 (`projects`, `networks`); anything
    // before it is incidental output. Nested lines of a pretty-printed envelope are indented, so they never start one.
    let envelope;
    for (let i = lines.length - 1; i >= 0 && !envelope; i--) {
        if (lines[i]?.startsWith("{"))
            envelope = parseObject(lines.slice(i).join("\n"));
    }
    // Otherwise the last JSON line, when something was printed after it.
    const lastLine = lines.filter((line) => line.trim().startsWith("{")).pop();
    envelope ??= lastLine === undefined ? undefined : parseObject(lastLine);
    if (!lastLine) {
        return {
            data: {
                errors: [
                    {
                        code: "NO_JSON",
                        message: run.stderr.trim() || `flisk exited with code ${run.exitCode}`,
                    },
                ],
            },
            isError: true,
        };
    }
    if (!envelope) {
        return {
            data: { errors: [{ code: "BAD_JSON", message: lastLine.slice(0, 200) }] },
            isError: true,
        };
    }
    const failed = (envelope.errors?.length ?? 0) > 0 || envelope.data?.ok === false || envelope.ok === false;
    return { data: envelope, isError: failed };
}
/**
 * Turn the output of a command that has no `--json` (the scaffolding commands) into a tool result: its text output, and an
 * error result when it exits non-zero. Failures are printed to stderr, so it is returned too.
 */
export function toTextResult(run) {
    const stderr = run.stderr.trim();
    return {
        data: { exitCode: run.exitCode, output: run.stdout.trim(), ...(stderr ? { stderr } : {}) },
        isError: run.exitCode !== 0,
    };
}
export const defaultUpDeps = {
    spawnUp(args, logFile, cwd) {
        const fd = openSync(logFile, "a");
        const [command, ...prefix] = cliInvocation();
        const child = spawn(command, [...prefix, ...args], {
            cwd,
            detached: true,
            stdio: ["ignore", fd, fd],
            env: { ...process.env, NO_COLOR: "1" },
        });
        closeSync(fd);
        return child;
    },
    readLog(logFile) {
        try {
            return readFileSync(logFile, "utf-8");
        }
        catch {
            return "";
        }
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    logFile: () => join(tmpdir(), `flisk-mcp-up-${Date.now()}.log`),
};
export function buildUpArgs(args) {
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
/**
 * Starts the stack detached and returns without waiting for it to be ready (a build can take minutes, longer than a tool
 * call may last). It watches only for an early result, which is how a refusal such as UNKNOWN_SERVICE, TILT_ALREADY_RUNNING
 * or an unsupported host arrives; otherwise the caller polls the `status` tool for `data.tilt.readiness`.
 */
export async function startUp(args, deps = defaultUpDeps) {
    const argv = buildUpArgs(args);
    const logFile = deps.logFile();
    const child = deps.spawnUp(argv, logFile, projectPath(args.projectPath));
    let exited;
    child.once("exit", (code) => {
        exited = code;
    });
    const waitMs = typeof args.waitSeconds === "number"
        ? Math.min(Math.max(args.waitSeconds, 0), 60) * 1000
        : 15_000;
    const deadline = deps.now() + waitMs;
    for (;;) {
        const log = deps.readLog(logFile);
        const line = log
            .split("\n")
            .filter((l) => l.startsWith('{"schemaVersion"'))
            .pop();
        if (line)
            return { ...toToolResult({ exitCode: exited ?? null, stdout: line, stderr: "" }) };
        if (exited !== undefined) {
            return toToolResult({ exitCode: exited, stdout: "", stderr: log.slice(-2000) });
        }
        if (deps.now() >= deadline)
            break;
        await deps.sleep(250);
    }
    child.unref();
    return {
        data: createMachineEnvelope({
            ok: true,
            started: true,
            pid: child.pid ?? null,
            logFile,
            next: "Poll the status tool until data.tilt.readiness.ready is true. Call down to stop it.",
        }),
        isError: false,
    };
}
export function buildLogsArgs(args) {
    const out = ["logs", "--json"];
    for (const name of names(args.services, "services"))
        out.push(`--service=${name}`);
    if (args.tail !== undefined) {
        if (!Number.isInteger(args.tail) || args.tail < 1) {
            throw new FliskError("tail must be a positive integer", [
                "Pass a whole number from 1 to 10000, or omit tail for the last 200 lines",
            ]);
        }
        out.push(`--tail=${args.tail}`);
    }
    if (args.since !== undefined) {
        if (typeof args.since !== "string" || !SINCE.test(args.since)) {
            throw new FliskError("since must be a duration such as 30s, 5m or 1h", [
                "Pass a number with a unit (ms, s, m, h), or omit since for all buffered logs",
            ]);
        }
        out.push(`--since=${args.since}`);
    }
    return out;
}
/** `flisk resource <name> ... --yes`: options as `--flag=value`, after the name, so a variadic `--feature` never takes it. */
export function buildResourceCreateArgs(args) {
    const name = optionalName(args.name, "name");
    if (!name) {
        throw new FliskError("name is required", ["Pass a kebab-case name, for example orders-api"]);
    }
    const type = optionalChoice(args.type, "type", CREATABLE_RESOURCE_TYPES);
    const stack = optionalName(args.stack, "stack");
    const framework = optionalName(args.framework, "framework");
    const language = optionalName(args.language, "language");
    const port = optionalPort(args.port, "port");
    const features = names(args.features, "features");
    const runtime = optionalName(args.runtime, "runtime");
    const durability = optionalName(args.durability, "durability");
    const out = ["resource", name];
    if (type)
        out.push(`--type=${type}`);
    if (stack)
        out.push(`--stack=${stack}`);
    if (framework)
        out.push(`--framework=${framework}`);
    if (language)
        out.push(`--language=${language}`);
    if (port !== undefined)
        out.push(`--port=${port}`);
    out.push(...features.map((feature) => `--feature=${feature}`));
    if (runtime)
        out.push(`--runtime=${runtime}`);
    if (durability)
        out.push(`--durability=${durability}`);
    out.push("--yes");
    return out;
}
/** `flisk stack <stack> --resources=<name>... --yes`: one `--resources=` per name so a value is never a flag. */
export function buildStackAssignArgs(args) {
    const stack = optionalName(args.stack, "stack");
    if (!stack) {
        throw new FliskError("stack is required", ["Pass the kebab-case stack to assign them to"]);
    }
    const resources = names(args.resources, "resources");
    if (resources.length === 0) {
        throw new FliskError("resources must name at least one resource", [
            "resource_list shows each resource's stack; pass the names without one",
        ]);
    }
    return ["stack", stack, ...resources.map((resource) => `--resources=${resource}`), "--yes"];
}
/** `flisk project [template] --yes`. Never `--force`, which overwrites an existing .flisk/project.json. */
export function buildProjectInitArgs(args) {
    const template = optionalChoice(args.template, "template", Object.keys(PROJECT_TEMPLATES));
    const path = optionalPath(args.path, "path");
    // The command ignores these in the other mode; refusing them keeps a caller from believing they applied.
    if (path && !template) {
        throw new FliskError("path applies only with a template", ["Drop path, or pass template"]);
    }
    if (template && args.agentSkills !== undefined) {
        throw new FliskError("agentSkills applies only to a blank project, not to a template", [
            "Drop agentSkills, or omit template",
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
/**
 * `flisk config regenerate`, a dry run unless `dryRun` is explicitly false: a real run rewrites the generated master files
 * from .flisk/project.json and discards any hand edits in them.
 */
export function buildConfigRegenerateArgs(args) {
    return flag(args.dryRun, "dryRun", true)
        ? ["config", "regenerate", "--dry-run"]
        : ["config", "regenerate"];
}
/**
 * `flisk eject --json`. A real run writes EJECTED.md into the project, so it is refused unless `confirm` is true; a dry run
 * changes nothing and needs no confirmation.
 */
export function buildProjectEjectArgs(args) {
    const dryRun = flag(args.dryRun, "dryRun");
    if (!dryRun && !flag(args.confirm, "confirm")) {
        throw new FliskError("project_eject writes EJECTED.md into the project; it needs confirm: true", [
            "Pass confirm: true to eject",
            "Pass dryRun: true to list the generated files and what would be written, without confirm",
        ]);
    }
    return dryRun ? ["eject", "--dry-run", "--json"] : ["eject", "--yes", "--json"];
}
/** `flisk import [dir] --json`, which writes without a prompt unless `dryRun` is set. `dir` comes before the flags. */
export function buildProjectImportArgs(args) {
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
const OBJECT = (properties) => ({
    type: "object",
    properties,
    additionalProperties: false,
});
const PROJECT_PATH = {
    type: "string",
    description: "Absolute path to the Flisk project root; run this operation from that directory.",
};
function projectPath(value) {
    if (value === undefined)
        return undefined;
    if (typeof value !== "string" || !isAbsolute(value)) {
        throw new FliskError("projectPath must be an absolute path to a Flisk project root", [
            "Pass the absolute path of the directory that holds .flisk/project.json",
            "Or omit projectPath to run in the MCP server's directory",
        ]);
    }
    return value;
}
export function createFliskTools(run = runFliskCli, up = defaultUpDeps) {
    const viaCli = (build, options = {}) => async (args) => toToolResult(await run(build(args), { cwd: projectPath(args.projectPath), ...options }));
    /** For a command without `--json`: returns its text output. */
    const viaCliText = (build, options = {}) => async (args) => toTextResult(await run(build(args), { cwd: projectPath(args.projectPath), ...options }));
    return [
        {
            name: "doctor",
            description: "Check whether this machine can run the Flisk stack. Optionally set projectPath to include checks for a specific Flisk project. Returns data.ready and data.host.canUp; run it before `up`.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                noPing: { type: "boolean", description: "Skip pinging running services' health endpoints" },
            }),
            handler: viaCli((args) => [
                "doctor",
                "--json",
                ...(flag(args.noPing, "noPing") ? ["--no-ping"] : []),
            ]),
        },
        {
            name: "up",
            description: "Start the stack (or part of it) detached from the optional projectPath and return without waiting for it to be ready. Poll `status` for data.tilt.readiness.ready. Fails fast on an unknown service, an unsupported host, or a Tilt already running.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                stack: { type: "string", description: "Only this stack" },
                only: {
                    type: "array",
                    items: { type: "string" },
                    description: "Start only these services plus what they depend on and shared infrastructure",
                },
                force: { type: "boolean", description: "Replace a Tilt that is already running" },
                dryRun: { type: "boolean", description: "Show what would be started without starting" },
                waitSeconds: {
                    type: "number",
                    description: "How long to watch for an early failure before returning (default 15, max 60)",
                },
            }),
            handler: (args) => startUp(args, up),
        },
        {
            name: "down",
            description: "Stop the running stack, optionally selecting its project with projectPath.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                dryRun: { type: "boolean", description: "Show what would be stopped without stopping" },
            }),
            handler: viaCli((args) => [
                "down",
                "--json",
                ...(flag(args.dryRun, "dryRun") ? ["--dry-run"] : []),
            ]),
        },
        {
            name: "status",
            description: "Stacks, resources, their ingress URLs and container ports, the stack-level ports, and Tilt readiness (data.tilt.readiness: ready, pending, failures, enabled; null when no Tilt answers). Optionally select the project with projectPath.",
            inputSchema: OBJECT({ projectPath: PROJECT_PATH }),
            handler: viaCli(() => ["status", "--json"]),
        },
        {
            name: "logs",
            description: "A bounded snapshot of recent logs from the running stack (default the last 200 lines, at most 10000). Optionally select the project with projectPath. Not a stream.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                services: { type: "array", items: { type: "string" }, description: "Only these services" },
                tail: { type: "integer", minimum: 1, maximum: 10000 },
                since: {
                    type: "string",
                    description: "Only logs newer than this, for example 30s, 5m, 1h",
                },
            }),
            handler: viaCli(buildLogsArgs),
        },
        {
            name: "resource_list",
            description: "List the selected project's services (resources) with their stack, type and port. Set projectPath when the MCP server is not running from the project root.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                stack: { type: "string", description: "Only this stack" },
            }),
            handler: viaCli((args) => {
                const stack = optionalName(args.stack, "stack");
                return ["resources", "--json", ...(stack ? [`--stack=${stack}`] : [])];
            }),
        },
        {
            name: "resource_restart",
            aliases: ["restart_resource"],
            description: "Restart a running resource in the stack (or trigger its rebuild). Set projectPath when the MCP server is not running from the project root.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                resource: { type: "string", description: "Name of the resource to restart" },
            }),
            handler: viaCli((args) => {
                const resource = optionalName(args.resource, "resource");
                if (!resource) {
                    throw new FliskError("resource is required", [
                        "Pass the resource name; resource_list shows them",
                    ]);
                }
                return ["restart", resource, "--json"];
            }),
        },
        {
            name: "agent_list",
            aliases: ["list_agents"],
            description: "List AI agent resources (appType: 'agent') in the project with their stack, runtime, durability and port. Set projectPath when the MCP server is not running from the project root.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                stack: { type: "string", description: "Only this stack" },
            }),
            handler: viaCli((args) => {
                const stack = optionalName(args.stack, "stack");
                return ["resources", "--type=agent", "--json", ...(stack ? [`--stack=${stack}`] : [])];
            }),
        },
        {
            name: "agent_sessions",
            aliases: ["get_agent_sessions"],
            description: "List the sessions of a running AI agent resource (id, last activity, status, checkpoint size), or read one session's checkpoint when sessionId is set. Set projectPath when the MCP server is not running from the project root.",
            inputSchema: {
                ...OBJECT({
                    projectPath: PROJECT_PATH,
                    resource: { type: "string", description: "Name of the agent resource" },
                    sessionId: {
                        type: "string",
                        description: "Session ID to read; omit it to list all sessions",
                    },
                }),
                required: ["resource"],
            },
            handler: viaCli((args) => {
                const resource = optionalName(args.resource, "resource");
                if (!resource) {
                    throw new FliskError("resource is required", [
                        "Pass the agent resource name; agent_list shows them",
                    ]);
                }
                const sessionId = optionalName(args.sessionId, "sessionId");
                return sessionId
                    ? ["agent", "sessions", resource, `--session-id=${sessionId}`, "--json"]
                    : ["agent", "sessions", resource, "--json"];
            }),
        },
        {
            name: "stack_list",
            description: "List the project's stacks with their resource counts. Set services to include each stack's service names, and verbose for its description. Set projectPath when the MCP server is not running from the project root.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                services: { type: "boolean", description: "Include the service names in each stack" },
                verbose: { type: "boolean", description: "Include each stack's description" },
            }),
            handler: viaCli((args) => [
                "stacks",
                "--json",
                ...(flag(args.services, "services") ? ["--services"] : []),
                ...(flag(args.verbose, "verbose") ? ["--verbose"] : []),
            ]),
        },
        {
            name: "project_info",
            description: "Project root, whether the generated master files exist (data.configured, data.missingFiles), and resource and stack counts. Set projectPath when the MCP server is not running from the project root.",
            inputSchema: OBJECT({ projectPath: PROJECT_PATH }),
            handler: viaCli(() => ["projects", "--json"]),
        },
        {
            name: "network_list",
            description: "The Traefik URL of every frontend and API service, with its base path, port and whether it answers (running, stopped). Set projectPath when the MCP server is not running from the project root.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                stack: { type: "string", description: "Only this stack" },
            }),
            handler: viaCli((args) => {
                const stack = optionalName(args.stack, "stack");
                return ["networks", "--json", ...(stack ? [`--stack=${stack}`] : [])];
            }),
        },
        {
            name: "config_verify",
            description: "Check that the generated files match .flisk/project.json and that every service.json is valid. Returns data.valid, data.errors, data.warnings and data.diffs; a drifted generated file is fixed with config_regenerate. Set projectPath when the MCP server is not running from the project root.",
            inputSchema: OBJECT({ projectPath: PROJECT_PATH }),
            handler: viaCli(() => ["config", "verify", "--json"]),
        },
        {
            name: "config_explain",
            description: "Explain one project file: whether Flisk generated it or the user owns it, its source, whether it is edited now, whether editing it blocks `up`, and what to edit instead. Run it before editing a file you did not write. Set projectPath when the MCP server is not running from the project root.",
            inputSchema: {
                ...OBJECT({
                    projectPath: PROJECT_PATH,
                    file: {
                        type: "string",
                        description: "The file, relative to projectPath (or to the server's directory) or absolute; it must be inside the project",
                    },
                }),
                required: ["file"],
            },
            handler: viaCli((args) => {
                const file = optionalPath(args.file, "file");
                if (!file) {
                    throw new FliskError("file is required", [
                        "Pass the project file to explain, for example .flisk/.flisk-out/Tiltfile",
                    ]);
                }
                return ["config", "explain", file, "--json"];
            }),
        },
        {
            name: "runtime_check",
            description: "Check that the installed Flisk CLI has its bundled runtime assets (engine, templates). Returns ok, assetRoot and what is missing; a source checkout reports ok: false because the assets exist only in a packaged install. projectPath is optional: a project-local install under its node_modules is checked too.",
            inputSchema: OBJECT({ projectPath: PROJECT_PATH }),
            handler: viaCli(() => ["runtime", "--check-assets", "--json"]),
        },
        {
            name: "config_regenerate",
            description: "Regenerate the master config files in .flisk/.flisk-out/ from .flisk/project.json. A dry run by default, which returns the planned changes as text; set dryRun to false to write them, which discards hand edits in those generated files. Set projectPath when the MCP server is not running from the project root.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                dryRun: {
                    type: "boolean",
                    description: "Default true: show what would change. false rewrites the files and discards hand edits in them",
                },
            }),
            handler: viaCliText(buildConfigRegenerateArgs),
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
                        enum: [...CREATABLE_RESOURCE_TYPES],
                        description: "Resource type (default backend)",
                    },
                    stack: { type: "string", description: "Stack to assign the resource to" },
                    framework: {
                        type: "string",
                        description: "Frontend: react (default), vue, svelte, preact, lit, solid, qwik, vanilla, tanstack-router, next. Backend: hono (default), express, elysia, fastify, nestjs, koa, h3",
                    },
                    language: {
                        type: "string",
                        description: "Backend language: bun (default), python, go, rust, node",
                    },
                    port: {
                        type: "integer",
                        minimum: 1,
                        maximum: 65535,
                        description: "Port within the type's range (default: the next free one)",
                    },
                    features: {
                        type: "array",
                        items: { type: "string" },
                        description: "Resource features to enable, for example prisma or drizzle",
                    },
                    runtime: { type: "string", description: "Agent runtime (type agent only): custom" },
                    durability: {
                        type: "string",
                        description: "Where agent sessions are checkpointed (type agent only): files or postgres",
                    },
                }),
                required: ["name"],
            },
            handler: viaCliText(buildResourceCreateArgs),
        },
        {
            name: "stack_assign",
            description: "Assign resources that have no stack yet to a stack (writes `stack` into their service.json). A resource already in a stack is refused. Returns the command's text output. Set projectPath when the MCP server is not running from the project root.",
            inputSchema: {
                ...OBJECT({
                    projectPath: PROJECT_PATH,
                    stack: { type: "string", description: "Stack name (kebab-case)" },
                    resources: {
                        type: "array",
                        items: { type: "string" },
                        description: "Names of the resources to assign",
                    },
                }),
                required: ["stack", "resources"],
            },
            handler: viaCliText(buildStackAssignArgs),
        },
        {
            name: "project_init",
            description: "Create a Flisk project with `flisk project --yes`: in projectPath (an existing directory; default the server's directory) write .flisk/project.json and generate its files, or, with template, clone a starter project into a new directory there (then call project_init again with projectPath set to the clone to configure it). Inside an existing project it refreshes that project's generated files instead and never overwrites its project.json. Returns the command's text output.",
            inputSchema: OBJECT({
                projectPath: {
                    type: "string",
                    description: "Absolute path to an existing directory to create the project in (or to clone the template from)",
                },
                template: {
                    type: "string",
                    enum: Object.keys(PROJECT_TEMPLATES),
                    description: "Clone this starter project instead of creating a blank one",
                },
                path: {
                    type: "string",
                    description: "Template only: directory to clone into, relative to projectPath or absolute (default: the template's repository name)",
                },
                agentSkills: {
                    type: "boolean",
                    description: "Blank project only: write the Flisk agent skills and AGENTS.md (default true)",
                },
            }),
            handler: viaCliText(buildProjectInitArgs, { timeoutMs: PROJECT_INIT_TIMEOUT_MS }),
        },
        {
            name: "project_eject",
            description: "Write EJECTED.md with `flisk eject --json`: it lists the generated Tilt files and how to run the stack with plain Tilt, and copies, moves or deletes nothing. It changes the project, so it is refused unless confirm is true; dryRun returns the plan (data.generatedFiles, data.created) without confirm. Set projectPath when the MCP server is not running from the project root.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                confirm: {
                    type: "boolean",
                    description: "Must be true to write EJECTED.md; without it only a dry run is allowed",
                },
                dryRun: {
                    type: "boolean",
                    description: "List the generated files and what would be written, without writing",
                },
            }),
            handler: viaCli(buildProjectEjectArgs),
        },
        {
            name: "project_import",
            description: "Import the services in a directory's root docker-compose.yml as bring-your-own service.json files with `flisk import --json`, which runs the pinned flisk-import from npm (the first run needs network access). It writes without asking: set dryRun to get the plan only, and force to overwrite an existing service.json. Returns data.written and the importer's output. Set projectPath when the MCP server is not running from the project root.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                dir: {
                    type: "string",
                    description: "Directory with the docker-compose.yml, relative to projectPath or absolute (default: projectPath)",
                },
                dryRun: { type: "boolean", description: "Print the plan and write nothing" },
                force: { type: "boolean", description: "Overwrite an existing service.json" },
            }),
            handler: viaCli(buildProjectImportArgs, { timeoutMs: IMPORT_TIMEOUT_MS }),
        },
    ];
}
