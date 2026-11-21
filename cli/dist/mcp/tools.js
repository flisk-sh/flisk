// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawn } from "node:child_process";
import { closeSync, openSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { RESOURCE_CREATE_TYPE_VALUES } from "../types/index.js";
import { cliInvocation } from "../utils/cli-invocation.js";
import { collectSidecarDependents, DEFAULT_MCP_CLI_TIMEOUT_MS, isGeneratedComposeContainer, resolveRestartCliTimeoutMs, resolveRestartSequenceCliTimeoutMs, } from "../utils/container-restart.js";
import { FliskError } from "../utils/errors.js";
import { isValidCursor } from "../utils/log-cursors.js";
import { createMachineEnvelope } from "../utils/machine-output.js";
import { isProcessAlive, nativeServiceStates, readNativeRunState, } from "../utils/native-runtime.js";
import { withFailureLogs } from "../utils/native-up.js";
import { findProjectRoot } from "../utils/paths.js";
import { listProjectTemplates, PROJECT_TEMPLATES } from "../utils/project-templates.js";
import { OUTPUT_WITHHELD, projectSecretValues, redactProjectText, redactValue, } from "../utils/secret-redaction.js";
import { clearDiscoveryResultCache, discoverResourcesWithProblems } from "../utils/services.js";
import { findTool, toolIds } from "../utils/tool-catalog.js";
/** A service or stack name. A leading "-" is rejected so a value can never be read as a flag. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SINCE = /^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$/;
/** Cloning a starter repository can outlast the default two minutes. */
const PROJECT_INIT_TIMEOUT_MS = 300_000;
/** `flisk import` fetches flisk-import through npx first, which can outlast the default two minutes too. */
const IMPORT_TIMEOUT_MS = 300_000;
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
/** A list of project-relative paths (used by config_verify's opt-in diffFiles). */
function paths(value, field) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value)) {
        throw new FliskError(`${field} must be an array of paths`, [
            `Pass ${field} as paths reported by config_verify, for example ["Tiltfile"]`,
        ]);
    }
    return value.map((item) => {
        const file = optionalPath(item, field);
        if (file === undefined)
            throw new FliskError(`${field} must contain only non-empty paths`);
        return file;
    });
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
/** Short human text for config_verify: structuredContent already carries the full report (#4205). */
const VERIFY_SUMMARY_LINE_LIMIT = 60;
export function summarizeConfigVerify(data) {
    const envelope = data;
    const report = envelope?.data;
    if (!report || typeof report !== "object")
        return undefined;
    const errors = Array.isArray(report.errors)
        ? report.errors.filter((error) => typeof error === "string")
        : [];
    const diffs = Array.isArray(report.diffs) ? report.diffs : [];
    const missing = diffs.filter((entry) => entry?.state === "missing").length;
    const different = diffs.filter((entry) => entry?.state === "different").length;
    const heading = errors.length === 0 && report.valid === true
        ? "config verify: all files are in sync."
        : `config verify: ${errors.length} finding(s); ${missing} missing, ${different} different file(s).`;
    const lines = [heading, ...errors];
    if (diffs.length > 0) {
        lines.push("See structuredContent for every path; pass diffFiles to request a file's diff.");
    }
    if (lines.length > VERIFY_SUMMARY_LINE_LIMIT) {
        const hidden = lines.length - VERIFY_SUMMARY_LINE_LIMIT;
        lines.length = VERIFY_SUMMARY_LINE_LIMIT;
        lines.push(`... [${hidden} more line(s) in structuredContent]`);
    }
    return lines.join("\n");
}
/**
 * Turn the output of a command that has no `--json` (the scaffolding commands) into a tool result: its text output, and an
 * error result when it exits non-zero. Failures are printed to stderr, so it is returned too.
 */
export function toTextResult(run) {
    const stderr = run.stderr.trim();
    return {
        data: {
            exitCode: run.exitCode,
            output: run.stdout.trim(),
            ...(stderr ? { stderr } : {}),
        },
        isError: run.exitCode !== 0,
    };
}
export function readNativeUpSnapshot(projectDir, since) {
    const root = findProjectRoot(projectDir) ?? projectDir;
    const run = readNativeRunState(root);
    // A run on record from before this start (or whose supervisor is gone) says nothing about it.
    if (!run || !isProcessAlive(run.pid) || Date.parse(run.startedAt) < since - 1000)
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
            data: { ...(envelope.data ?? {}), state, ready: state === "ready" },
        },
    };
}
export const defaultUpDeps = {
    spawnUp(args, logFile, cwd) {
        const fd = openSync(logFile, "a", 0o600);
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
    nativeSnapshot: readNativeUpSnapshot,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    logFile: () => join(tmpdir(), `flisk-mcp-up-${Date.now()}.log`),
};
export function buildUpArgs(args) {
    const stack = optionalName(args.stack, "stack");
    const only = names(args.only, "only");
    const profile = names(args.profile, "profile");
    const envFile = optionalPath(args.envFile, "envFile");
    const out = ["up"];
    if (stack)
        out.push(stack);
    if (only.length > 0)
        out.push(...only.map((name) => `--only=${name}`));
    if (profile.length > 0)
        out.push(...profile.map((name) => `--profile=${name}`));
    if (envFile)
        out.push(`--env-file=${envFile}`);
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
    // A child that cannot start (a projectPath that does not exist) emits "error" and never "exit"; without a listener that event
    // is thrown and takes the whole MCP server down with it.
    let spawnError;
    child.once("error", (error) => {
        spawnError = error;
    });
    // Without waitForReady the wait only watches for an early failure; with it, the wait is for readiness itself.
    const waitForReady = flag(args.waitForReady, "waitForReady");
    const [defaultWait, maxWait] = waitForReady ? [120, 600] : [15, 60];
    const waitMs = typeof args.waitSeconds === "number"
        ? Math.min(Math.max(args.waitSeconds, 0), maxWait) * 1000
        : defaultWait * 1000;
    const launchedAt = Date.now();
    const deadline = deps.now() + waitMs;
    for (;;) {
        if (spawnError) {
            return toToolResult({
                exitCode: 1,
                stdout: "",
                stderr: `Could not start flisk up: ${spawnError.message}`,
            });
        }
        const log = deps.readLog(logFile);
        const line = log
            .split("\n")
            .filter((l) => l.startsWith('{"schemaVersion"'))
            .pop();
        if (line) {
            const result = toToolResult({
                exitCode: exited ?? null,
                stdout: line,
                stderr: "",
            });
            if (!result.isError) {
                try {
                    rmSync(logFile, { force: true });
                }
                catch {
                    // The startup result remains valid if log cleanup is unavailable.
                }
            }
            // A local-process run prints its result only once every service passed its readiness check, so a success is `ready`.
            // The Tilt path prints it at launch: say nothing about readiness there (poll `status`).
            const reported = result.data.data;
            if (result.isError)
                return withUpState(result, "failed");
            if (reported?.runtime !== "native" || reported.dryRun)
                return { ...result };
            if (!reported.alreadyRunning)
                return withUpState(result, "ready");
            // The run was already up before this call: what it is doing now is on record, not in this result.
            const current = deps.nativeSnapshot?.(projectPath(args.projectPath) ?? process.cwd(), 0);
            const allReady = current !== null &&
                current !== undefined &&
                Object.values(current.services).every((service) => service.status === "ready");
            if (allReady || !current)
                return withUpState(result, allReady ? "ready" : "starting");
            const starting = withUpState(result, "starting");
            const envelope = starting.data;
            return {
                ...starting,
                data: {
                    ...envelope,
                    data: { ...envelope.data, services: current.services, logs: current.logs },
                },
            };
        }
        if (exited !== undefined) {
            return withUpState(toToolResult({
                exitCode: exited,
                stdout: "",
                // Masked before it is cut, so the cut cannot shorten a secret out of recognition.
                stderr: redactProjectText(log, projectPath(args.projectPath)).slice(-2000),
            }), "failed");
        }
        if (deps.now() >= deadline) {
            // A zero window would otherwise return before a failed spawn has emitted its "error" event.
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
        const pending = snapshot
            ? Object.entries(snapshot.services)
                .filter(([, service]) => service.status !== "ready")
                .map(([name, service]) => `${name} (${service.reason ?? service.status})`)
            : [];
        return {
            data: createMachineEnvelope({
                ok: false,
                started: true,
                state: "timeout",
                ready: false,
                pid: child.pid ?? null,
                logFile,
                ...progress,
                next: "It is still starting and keeps running. Poll status until every service is ready, or call down to stop it. Next time pass a longer waitSeconds with waitForReady.",
            }, [
                {
                    code: "UP_NOT_READY_IN_TIME",
                    message: `Not ready after ${Math.round(waitMs / 1000)}s${pending.length > 0 ? `: ${pending.join(", ")}` : ""}.`,
                },
            ]),
            isError: true,
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
            next: "Started, not confirmed ready. Poll the status tool until every service is ready (data.tilt.readiness.ready for Tilt), or pass waitForReady next time to wait for it. Call down to stop it.",
        }),
        isError: false,
    };
}
/**
 * `flisk status --json --unhealthy` still lists every service (the flag only shortens the text output, and the envelope
 * carries the names in `data.unhealthy`). For an agent that wants the broken services only, drop the others from
 * `data.resources` and from each stack's `resources`, and say so in `data.filteredTo`. Counts keep describing the whole project.
 */
export function trimStatusToUnhealthy(result) {
    const envelope = result.data;
    const data = envelope?.data;
    if (!data || !Array.isArray(data.resources))
        return result;
    // A bare Node project reports one resource with a status and no `unhealthy` list: anything not ready is broken.
    const resourceList = data.resources;
    const broken = Array.isArray(data.unhealthy)
        ? new Set(data.unhealthy)
        : data.inferred === true
            ? new Set(resourceList.filter((r) => r.status !== "ready").map((r) => String(r.name)))
            : null;
    if (!broken)
        return result;
    const trimmed = {
        ...data,
        resources: data.resources.filter((r) => broken.has(String(r.name))),
        filteredTo: "unhealthy",
    };
    if (!Array.isArray(data.unhealthy))
        trimmed.unhealthy = [...broken];
    if (Array.isArray(data.stacks)) {
        trimmed.stacks = data.stacks.map((stack) => ({
            ...stack,
            resources: (stack.resources ?? []).filter((name) => broken.has(name)),
        }));
    }
    return { ...result, data: { ...envelope, data: trimmed } };
}
/** `flisk status --json`, narrowed by `unhealthy` and `stack` the way the CLI does. */
export function buildStatusArgs(args) {
    const out = ["status", "--json"];
    if (flag(args.unhealthy, "unhealthy"))
        out.push("--unhealthy");
    const stack = optionalName(args.stack, "stack");
    if (stack)
        out.push(`--stack=${stack}`);
    return out;
}
export function buildLogsArgs(args) {
    const out = ["logs", "--json"];
    if (flag(args.unhealthy, "unhealthy"))
        out.push("--unhealthy");
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
    if (args.after !== undefined) {
        const cursor = typeof args.after === "number" ? String(args.after) : args.after;
        if (typeof cursor !== "string" || !isValidCursor(cursor)) {
            throw new FliskError("after must be a non-negative integer cursor", [
                "Pass the data.nextCursor value returned by a previous logs call",
            ]);
        }
        out.push(`--after=${cursor}`);
    }
    if (args.source !== undefined) {
        if (args.source !== "runtime" && args.source !== "build") {
            throw new FliskError("source must be runtime or build", [
                "Use runtime for what a service printed (crash causes), build for image build steps, or omit source for both",
            ]);
        }
        out.push(`--source=${args.source}`);
    }
    return out;
}
/** `flisk resource <name> ... --yes`: options as `--flag=value`, after the name, so a variadic `--feature` never takes it. */
/** `flisk tool add <tool> [name] --json` for the tool_add tool; the tool must be one the catalog knows. */
export function buildToolAddArgs(args) {
    if (typeof args.tool !== "string" || !args.tool.trim()) {
        throw new FliskError("tool is required", [`Pass one of: ${toolIds().join(", ")}`]);
    }
    // The CLI's own spelling rules: "Next.js", "google cloud" and "Spring Boot" resolve, so a rejected tool reaches the
    // CLI and returns why it is rejected instead of a bare enum error.
    const tool = findTool(args.tool)?.id;
    if (!tool) {
        throw new FliskError(`Flisk does not know the tool "${args.tool}"`, [
            `Pass one of: ${toolIds().join(", ")}`,
        ]);
    }
    const name = optionalName(args.name, "name");
    const stack = optionalName(args.stack, "stack");
    const dryRun = flag(args.dryRun, "dryRun");
    return [
        "tool",
        "add",
        tool,
        ...(name ? [name] : []),
        "--json",
        ...(stack ? [`--stack=${stack}`] : []),
        ...(dryRun ? ["--dry-run"] : []),
    ];
}
export function buildResourceCreateArgs(args) {
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
    // Same rule as `flisk resource --local`, checked here so an agent gets it as a tool error before any command runs.
    if (local && type && type !== "frontend" && type !== "backend") {
        throw new FliskError(`local applies to type frontend or backend, not ${type}`, [
            "Leave local out to scaffold it for Docker and Tilt",
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
    if (port !== undefined)
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
/** `flisk stack <stack> --resources=<name>... --json`: one `--resources=` per name so a value is never a flag. */
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
    return [
        "stack",
        stack,
        ...(args.move === true ? ["--move"] : []),
        ...resources.map((resource) => `--resources=${resource}`),
        "--json",
    ];
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
        ? ["config", "regenerate", "--dry-run", "--json"]
        : ["config", "regenerate", "--json"];
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
/**
 * `flisk import [dir] --json`, which writes without a prompt unless `dryRun` is set. `dir` comes before the flags. `force`
 * overwrites an existing service.json, so a real run with it is refused unless `confirm` is true (a dry run changes nothing).
 */
export function buildProjectImportArgs(args) {
    if (flag(args.force, "force") && !flag(args.dryRun, "dryRun") && !flag(args.confirm, "confirm")) {
        throw new FliskError("project_import with force overwrites existing service.json files; it needs confirm: true", [
            "Ask the user, then pass confirm: true together with force: true",
            "Pass dryRun: true to see the plan without confirm",
            "Drop force to import without overwriting an existing service.json",
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
    // The path is the child's working directory, so a missing one would fail the
    // spawn with an ENOENT that names the binary instead of the directory. One
    // stat call tells a path that is not there (no entry) from one this process
    // cannot read (the error is kept, so a permission problem is not reported
    // as a missing directory).
    const stat = statSync(value, { throwIfNoEntry: false });
    if (!stat?.isDirectory()) {
        // Shared by project_init, which writes .flisk/project.json into the directory, so
        // the guidance must not assume the directory already holds one.
        throw new FliskError(`projectPath does not exist or is not a directory: ${value}`, [
            "Create the directory, or pass the absolute path of an existing directory (for a project that is already set up, the one that holds .flisk/project.json)",
            "Or omit projectPath to run in the MCP server's directory",
        ]);
    }
    return value;
}
/** Local-only reads: they inspect the project or the running stack and change nothing. */
const READ_ONLY = {
    readOnlyHint: true,
    openWorldHint: false,
};
const WRITES_LOCALLY = {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
};
const TOOL_ANNOTATIONS = {
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
        openWorldHint: true,
    },
    // dryRun is the default; dryRun: false overwrites the generated files and discards hand edits in them.
    config_regenerate: {
        ...WRITES_LOCALLY,
        destructiveHint: true,
        idempotentHint: true,
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
        openWorldHint: true,
    },
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
    }
    catch {
        return resolveRestartCliTimeoutMs();
    }
}
export function createFliskTools(run = runFliskCli, up = defaultUpDeps) {
    const viaCli = (build, options = {}) => async (args) => toToolResult(await run(build(args), {
        cwd: projectPath(args.projectPath),
        ...options,
    }));
    /** For a command without `--json`: returns its text output. */
    const viaCliText = (build, options = {}) => async (args) => toTextResult(await run(build(args), {
        cwd: projectPath(args.projectPath),
        ...options,
    }));
    const tools = [
        {
            name: "doctor",
            description: "Check whether this machine can run the Flisk stack (Docker, Tilt, ports). Read-only. Optionally set projectPath to include checks for a specific Flisk project; for local-process services that also reports missing node_modules/.venv with the exact install command, and hints at a .env in another git worktree with the copy command (it never copies). Returns data.ready and data.host.canUp; run it before `up`. For the state of a running stack use `status`; for whether generated files are consistent use `config_verify`.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                noPing: {
                    type: "boolean",
                    description: "Skip pinging running services' health endpoints",
                },
            }),
            handler: viaCli((args) => [
                "doctor",
                "--json",
                ...(flag(args.noPing, "noPing") ? ["--no-ping"] : []),
            ]),
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
                    description: "Start only these services plus what they depend on and shared infrastructure",
                },
                profile: {
                    type: "array",
                    items: { type: "string" },
                    description: "Also start the services whose profiles in service.json include one of these names (without it they are left out)",
                },
                envFile: {
                    type: "string",
                    description: "Use this project env file for the run instead of .env, for example .env.integration",
                },
                force: {
                    type: "boolean",
                    description: "Replace a Tilt that is already running",
                },
                dryRun: {
                    type: "boolean",
                    description: "Show what would be started without starting",
                },
                waitForReady: {
                    type: "boolean",
                    description: "Wait until every service passed its readiness check (local-process stacks), instead of only watching for an early failure",
                },
                waitSeconds: {
                    type: "number",
                    description: "How long to wait before returning (default 15, max 60; with waitForReady default 120, max 600)",
                },
            }),
            handler: (args) => startUp(args, up),
        },
        {
            name: "down",
            description: "Stop the running stack, optionally selecting its project with projectPath. It stops the running services and does not edit the project's files. Use `status` first to see whether a stack is running, set dryRun to preview, and start it again with `up`.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                dryRun: {
                    type: "boolean",
                    description: "Show what would be stopped without stopping",
                },
            }),
            handler: viaCli((args) => [
                "down",
                "--json",
                ...(flag(args.dryRun, "dryRun") ? ["--dry-run"] : []),
            ]),
        },
        {
            name: "status",
            description: "Show the live state of the stack: its stacks, resources, their ingress URLs and container ports, the stack-level ports, and Tilt readiness (data.tilt.readiness: ready, pending, failures, enabled; null when no Tilt answers). Read-only. Poll it after `up`; after a failed `up` call it first with unhealthy: true to see only the broken services (data.resources and each stack's resources then hold only those; data.unhealthy names them and data.filteredTo says it was trimmed). For the services a project defines whether or not they run use `resource_list`; for URLs only use `network_list`; for host checks use `doctor`. Optionally select the project with projectPath.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                unhealthy: {
                    type: "boolean",
                    description: "Only the services that are failing or still starting. The first call after a failed `up`; with every service healthy it returns an empty list, not an error.",
                },
                stack: {
                    type: "string",
                    description: "Only report the services in this stack",
                },
            }),
            handler: async (args) => {
                const result = await viaCli(buildStatusArgs)(args);
                return flag(args.unhealthy, "unhealthy") ? trimStatusToUnhealthy(result) : result;
            },
        },
        {
            name: "logs",
            description: "A bounded snapshot of recent logs from the running stack (default the last 200 lines, at most 10000), returned as text. Read-only: reading with a cursor writes nothing. Not a stream: every JSON line has a `seq`, the response carries `data.nextCursor`, and passing that value back as `after` returns only newer lines (an unchanged log gives no lines and the same cursor; a cursor older than the retained log returns the oldest available lines with `data.truncated: true`). Optionally select the project with projectPath. After a failed `up`, call it first with unhealthy: true to read only the failing or still-starting services. Otherwise use `status` first to find which service is failing, then pass services to narrow the output and source `runtime` to skip image build output and read why it failed.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                services: {
                    type: "array",
                    items: { type: "string" },
                    description: "Only these services",
                },
                unhealthy: {
                    type: "boolean",
                    description: "Only the logs of failing or still-starting services. The first call after a failed `up`; with every service healthy it returns nothing, not an error.",
                },
                tail: { type: "integer", minimum: 1, maximum: 10000 },
                since: {
                    type: "string",
                    description: "Only logs newer than this, for example 30s, 5m, 1h",
                },
                after: {
                    type: "string",
                    description: "Only lines with seq greater than this cursor. Pass the data.nextCursor from a previous logs call; it may be a long integer, so send it as a string.",
                },
                source: {
                    type: "string",
                    enum: ["runtime", "build"],
                    description: "runtime: only what the services printed (where a crash cause such as an exception or a missing variable is); build: only image build steps. Omit for both.",
                },
            }),
            handler: viaCli(buildLogsArgs),
        },
        {
            name: "resource_list",
            description: "List the selected project's services (resources) with their stack, type, port and project-relative folder path, whether or not they are running. Read-only. Use `status` for live state, `stack_list` to group them by stack and `agent_list` for agents only. Set projectPath when the MCP server is not running from the project root.",
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
            description: "Restart one running resource in the stack along with any active container resources that transitively declare `sidecarOf` on it (Flisk-generated Compose containers restart without rebuilding their image; local-process resources of a project that runs without Tilt are restarted by the run that supervises them (its .env is re-read, only that service is stopped and started, and the result says whether it is `ready`, `failed` with its own output, or still starting); other non-container resources and projects using an imported Tiltfile fall back to `tilt trigger`); unrelated resources are not touched. It needs a running stack: start one with `up`. Set rebuild to true for a full Tilt update (rebuild the image and recreate the container, which re-reads the project .env). Names come from `resource_list`. Set projectPath when the MCP server is not running from the project root.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                resource: {
                    type: "string",
                    description: "Name of the resource to restart",
                },
                rebuild: {
                    type: "boolean",
                    description: "Rebuild the image and recreate the container through Tilt",
                },
                waitSeconds: {
                    type: "number",
                    description: "Local-process stacks: how long to wait for the service to be ready again (default 60, max 300; 0 returns once the restart has begun)",
                },
            }),
            handler: async (args) => {
                const resource = optionalName(args.resource, "resource");
                if (!resource) {
                    throw new FliskError("resource is required", [
                        "Pass the resource name; resource_list shows them",
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
                    ...(rebuild ? ["--rebuild"] : []),
                ];
                return toToolResult(await run(cliArgs, {
                    cwd,
                    // A local-process restart waits for readiness inside the command: allow for that wait.
                    timeoutMs: Math.max(restartCliTimeoutMs(cwd, resource, rebuild), waitSeconds * 1000 + 30_000),
                }));
            },
        },
        {
            name: "resource_run",
            description: "Run a one-off command (a seed script, a migration, a status check) with the environment one resource has in the stack, and return its exit code, stdout and stderr (the last 64 KB of each; values from the project's .env files are masked). It runs any command, so it is refused unless confirm is true: ask the user first. A container resource must be running (start it with `up`); a local-process resource runs from its folder. No input is passed. Names come from `resource_list`. Set projectPath when the MCP server is not running from the project root.",
            inputSchema: {
                ...OBJECT({
                    projectPath: PROJECT_PATH,
                    resource: {
                        type: "string",
                        description: "Name of the resource whose environment the command gets",
                    },
                    command: {
                        type: "array",
                        items: { type: "string" },
                        description: 'The program and its arguments, for example ["node", "scripts/seed.js"]',
                    },
                    confirm: {
                        type: "boolean",
                        description: "Must be true to run the command: it runs arbitrary code in the resource's environment",
                    },
                }),
                required: ["resource", "command"],
            },
            handler: viaCli((args) => {
                const resource = optionalName(args.resource, "resource");
                if (!resource) {
                    throw new FliskError("resource is required", [
                        "Pass the resource name; resource_list shows them",
                    ]);
                }
                const command = Array.isArray(args.command)
                    ? args.command.filter((part) => typeof part === "string")
                    : [];
                if (command.length === 0) {
                    throw new FliskError("command is required", [
                        'Pass the program and its arguments, for example ["node", "scripts/seed.js"]',
                    ]);
                }
                if (!flag(args.confirm, "confirm")) {
                    throw new FliskError(`resource_run runs \`${command.join(" ")}\` in the ${resource} environment; it needs confirm: true`, [
                        "Ask the user to approve this command, then call resource_run again with confirm: true",
                        "For read-only inspection use status, logs or resource_list, which need no confirm",
                    ]);
                }
                return ["run", resource, "--json", "--", ...command];
            }),
        },
        {
            name: "agent_list",
            aliases: ["list_agents"],
            description: "List AI agent resources (appType: 'agent') in the project with their stack, runtime, durability and port. Read-only. Use `resource_list` for every resource type, and `agent_sessions` to inspect one agent's sessions. Set projectPath when the MCP server is not running from the project root.",
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
                    resource: {
                        type: "string",
                        description: "Name of the agent resource",
                    },
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
            description: "List the project's stacks with their resource counts. Read-only. Use `resource_list` for the resources themselves. Set services to include each stack's service names, and verbose for its description. Set projectPath when the MCP server is not running from the project root.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                services: {
                    type: "boolean",
                    description: "Include the service names in each stack",
                },
                verbose: {
                    type: "boolean",
                    description: "Include each stack's description",
                },
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
            description: "Project root, whether the generated master files exist (data.configured, data.missingFiles), and resource and stack counts. Read-only; a quick first call to learn whether a folder is a configured Flisk project. Use `config_verify` to check that the generated files match, and `status` for the running stack. Set projectPath when the MCP server is not running from the project root.",
            inputSchema: OBJECT({ projectPath: PROJECT_PATH }),
            handler: viaCli(() => ["projects", "--json"]),
        },
        {
            name: "project_templates",
            description: "List the starter templates project_init can clone (data.templates): each one's key, repo, description and what it needs to run (needs), plus the ref it checks out when pinned to a commit. Read-only; the same rows as `flisk project --list --json`. Pass a key as project_init's template.",
            inputSchema: OBJECT({}),
            handler: async () => ({
                data: { templates: listProjectTemplates() },
                isError: false,
            }),
        },
        {
            name: "network_list",
            description: "The Traefik URL of every frontend and API service, with its base path, port and whether it answers (running, stopped). Read-only. Use it to find where to open a service; use `status` for full readiness. Set projectPath when the MCP server is not running from the project root.",
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
            description: "Check that the generated files match .flisk/project.json and that every service.json is valid. By default returns a small summary: every error line and data.diffs entries with file, state (missing or different), linesAdded and linesRemoved, without file bodies. Pass diffFiles (paths from data.diffs, e.g. .flisk/.flisk-out/Tiltfile or Tiltfile) to request diffs for those files only, capped at 200 lines each with a truncation note; the CLI equivalent is flisk config verify --diff <file>. A drifted generated file is fixed with config_regenerate. Set projectPath when the MCP server is not running from the project root.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                diffFiles: {
                    type: "array",
                    description: "Include a capped diff for each named drifted file instead of a summary only",
                    items: {
                        type: "string",
                        description: "A path reported in data.diffs, e.g. .flisk/.flisk-out/Tiltfile",
                    },
                },
            }),
            handler: async (args) => {
                const diffFiles = paths(args.diffFiles, "diffFiles");
                const result = await viaCli(() => [
                    "config",
                    "verify",
                    "--json",
                    ...diffFiles.map((file) => `--diff=${file}`),
                ])(args);
                return { ...result, text: summarizeConfigVerify(result.data) };
            },
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
            description: "Read-only. Check that the installed Flisk CLI has its bundled runtime assets (engine, templates). Returns ok, assetRoot and what is missing; a source checkout reports ok: false because the assets exist only in a packaged install. projectPath is optional: a project-local install under its node_modules is checked too.",
            inputSchema: OBJECT({ projectPath: PROJECT_PATH }),
            handler: viaCli(() => ["runtime", "--check-assets", "--json"]),
        },
        {
            name: "config_regenerate",
            description: "Regenerate the master config files in .flisk/.flisk-out/ from .flisk/project.json. A dry run by default, which returns the planned changes as data.changes (each file's status and lineDiff) with data.hasChanges; set dryRun to false to write them and get the same list, which discards hand edits in those generated files. Set projectPath when the MCP server is not running from the project root.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                dryRun: {
                    type: "boolean",
                    description: "Default true: show what would change. false rewrites the files and discards hand edits in them",
                },
            }),
            handler: viaCli(buildConfigRegenerateArgs),
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
                        description: "Resource type (default backend). Redis, Qdrant, MinIO, MLflow, MySQL, MongoDB, ClickHouse, NATS, RabbitMQ, Mailpit and stripe-mock are frameworks: type database, queue, storage, mail or payment plus framework",
                    },
                    stack: {
                        type: "string",
                        description: "Stack to assign the resource to",
                    },
                    framework: {
                        type: "string",
                        description: "Frontend: react (default), vue, svelte, preact, lit, solid, qwik, vanilla, tanstack-router, next. Backend: hono (default), express, elysia, fastify, nestjs, koa, h3. Database: postgres (default, the shared Flisk Postgres), redis, qdrant, mlflow, mysql, mongodb, clickhouse (each its own container; the services that list it in dependsOn get its connection settings). Queue: nats (default), rabbitmq. Storage: minio (default). Mail: mailpit (default, local SMTP and inbox). Payment: stripe-mock (default, Stripe API emulator)",
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
                    runtime: {
                        type: "string",
                        description: "Agent runtime (type agent only): custom",
                    },
                    durability: {
                        type: "string",
                        description: "Where agent sessions are checkpointed (type agent only): files or postgres",
                    },
                    local: {
                        type: "boolean",
                        description: "Frontend or backend only: scaffold it to run on this computer with no Docker or Tilt (a plain Vite config, a command in service.json), the way flisk create does by default",
                    },
                }),
                required: ["name"],
            },
            handler: viaCliText(buildResourceCreateArgs),
        },
        {
            name: "tool_add",
            description: "Add a tool by its everyday name (react, nextjs, fastapi, nodejs, postgresql, mysql, mongodb, rag, embeddings, llm-api) with `flisk tool add <tool> --json`, which runs the matching `flisk resource` command. data.status says what happened: resource (created; data.resource is the resource_create result), built-in (docker: nothing to do), manual (angular, tailwind, spring-boot, github-actions, jutro, policycenter: data.steps are steps to show the user; nothing was changed), or an error for a rejected tool (aws, google-cloud, azure, kubernetes): Flisk runs everything locally and never creates cloud resources, so do not work around it. Call `up` afterwards to start a new resource. Set projectPath when the MCP server is not running from the project root.",
            inputSchema: {
                ...OBJECT({
                    projectPath: PROJECT_PATH,
                    tool: {
                        type: "string",
                        description: `The tool to add, by id or everyday name ("Next.js", "google cloud"): ${toolIds().join(", ")}`,
                    },
                    name: {
                        type: "string",
                        description: "Resource name (default per tool, for example web, server, db); a name already in use is refused",
                    },
                    stack: {
                        type: "string",
                        description: "Stack to assign the resource to",
                    },
                    dryRun: {
                        type: "boolean",
                        description: "Preview the resource without writing files or reserving a port",
                    },
                }),
                required: ["tool"],
            },
            handler: viaCli(buildToolAddArgs),
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
                        description: "Names of the resources to assign",
                    },
                    move: {
                        type: "boolean",
                        description: "Move resources that are already in another stack instead of refusing them",
                    },
                }),
                required: ["stack", "resources"],
            },
            handler: viaCli(buildStackAssignArgs),
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
                    description: "Template only: directory to clone into, relative to projectPath or absolute (default: the starter name, or its repository name)",
                },
                agentSkills: {
                    type: "boolean",
                    description: "Blank project only: write the Flisk agent skills and AGENTS.md (default true)",
                },
            }),
            handler: viaCliText(buildProjectInitArgs, {
                timeoutMs: PROJECT_INIT_TIMEOUT_MS,
            }),
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
            description: "Import the services in a directory's root docker-compose.yml as bring-your-own service.json files with `flisk import --json`, which runs the pinned flisk-import from npm (the first run needs network access). It writes without asking: set dryRun to get the plan only, and force to overwrite an existing service.json (force needs confirm: true unless dryRun is set). Returns data.written and the importer's output. Set projectPath when the MCP server is not running from the project root.",
            inputSchema: OBJECT({
                projectPath: PROJECT_PATH,
                dir: {
                    type: "string",
                    description: "Directory with the docker-compose.yml, relative to projectPath or absolute (default: projectPath)",
                },
                dryRun: {
                    type: "boolean",
                    description: "Print the plan and write nothing",
                },
                force: {
                    type: "boolean",
                    description: "Overwrite an existing service.json",
                },
                confirm: {
                    type: "boolean",
                    description: "Must be true together with force (unless dryRun) to overwrite files",
                },
            }),
            handler: viaCli(buildProjectImportArgs, { timeoutMs: IMPORT_TIMEOUT_MS }),
        },
    ];
    // Every tool returns what a `flisk` child printed, and a child can quote an application's output (logs, `run`, agent sessions,
    // failure excerpts). The child masks it already; this is the last stop before the text reaches an MCP client.
    return tools.map((tool) => ({
        ...tool,
        annotations: TOOL_ANNOTATIONS[tool.name],
        handler: async (args) => {
            const result = await tool.handler(args);
            const secrets = projectSecretValues(projectPath(args.projectPath));
            return {
                ...result,
                data: secrets === null
                    ? { errors: [{ code: "ENV_UNREADABLE", message: OUTPUT_WITHHELD }] }
                    : redactValue(result.data, secrets),
                ...(secrets === null ? { isError: true } : {}),
            };
        },
    }));
}
