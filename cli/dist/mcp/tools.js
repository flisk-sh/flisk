// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
/** A service or stack name. A leading "-" is rejected so a value can never be read as a flag. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SINCE = /^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$/;
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
/** Runs this same CLI (`tdk <args>`) so every tool behaves exactly like its command. */
export const runTdkCli = (args, options = {}) => new Promise((resolve, reject) => {
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
        throw new Error(`${field} must be an array of service names (letters, digits, ".", "_", "-")`);
    }
    return value;
}
function optionalName(value, field) {
    if (value === undefined)
        return undefined;
    if (typeof value !== "string" || !NAME.test(value)) {
        throw new Error(`${field} must be a name (letters, digits, ".", "_", "-")`);
    }
    return value;
}
function flag(value, field) {
    if (value === undefined)
        return false;
    if (typeof value !== "boolean")
        throw new Error(`${field} must be a boolean`);
    return value;
}
/** Turn a command's `--json` stdout into a tool result. A parseable envelope with errors, or `ok: false`, is an error result. */
export function toToolResult(run) {
    const text = run.stdout.trim();
    // The envelope is the last JSON line; anything before it is incidental output.
    const lastLine = text
        .split("\n")
        .filter((line) => line.trim().startsWith("{"))
        .pop();
    if (!lastLine) {
        return {
            data: {
                errors: [
                    { code: "NO_JSON", message: run.stderr.trim() || `tdk exited with code ${run.exitCode}` },
                ],
            },
            isError: true,
        };
    }
    try {
        const envelope = JSON.parse(lastLine);
        const failed = (envelope.errors?.length ?? 0) > 0 || envelope.data?.ok === false;
        return { data: envelope, isError: failed };
    }
    catch {
        return {
            data: { errors: [{ code: "BAD_JSON", message: lastLine.slice(0, 200) }] },
            isError: true,
        };
    }
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
    logFile: () => join(tmpdir(), `tdk-mcp-up-${Date.now()}.log`),
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
        data: {
            schemaVersion: 1,
            data: {
                ok: true,
                started: true,
                pid: child.pid ?? null,
                logFile,
                next: "Poll the status tool until data.tilt.readiness.ready is true. Call down to stop it.",
            },
            errors: [],
        },
        isError: false,
    };
}
export function buildLogsArgs(args) {
    const out = ["logs", "--json"];
    for (const name of names(args.services, "services"))
        out.push(`--service=${name}`);
    if (args.tail !== undefined) {
        if (!Number.isInteger(args.tail) || args.tail < 1) {
            throw new Error("tail must be a positive integer");
        }
        out.push(`--tail=${args.tail}`);
    }
    if (args.since !== undefined) {
        if (typeof args.since !== "string" || !SINCE.test(args.since)) {
            throw new Error("since must be a duration such as 30s, 5m or 1h");
        }
        out.push(`--since=${args.since}`);
    }
    return out;
}
const OBJECT = (properties) => ({
    type: "object",
    properties,
    additionalProperties: false,
});
const PROJECT_PATH = {
    type: "string",
    description: "Absolute path to the TDK project root; run this operation from that directory.",
};
function projectPath(value) {
    if (value === undefined)
        return undefined;
    if (typeof value !== "string" || !isAbsolute(value)) {
        throw new Error("projectPath must be an absolute path to a TDK project root");
    }
    return value;
}
export function createTdkTools(run = runTdkCli, up = defaultUpDeps) {
    const viaCli = (build) => async (args) => toToolResult(await run(build(args), { cwd: projectPath(args.projectPath) }));
    return [
        {
            name: "doctor",
            description: "Check whether this machine can run the TDK stack. Optionally set projectPath to include checks for a specific TDK project. Returns data.ready and data.host.canUp; run it before `up`.",
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
            inputSchema: OBJECT({ projectPath: PROJECT_PATH }),
            handler: viaCli(() => ["down", "--json"]),
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
    ];
}
