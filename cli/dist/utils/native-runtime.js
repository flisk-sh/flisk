// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import chalk from "chalk";
import { FliskError } from "./errors.js";
import { commandProgram } from "./native-service.js";
import { findOnPath } from "./which.js";
/** The directory, under the project's .flisk/, that holds the run state and log files. */
export const NATIVE_DIR = join(".flisk", "native");
const RUN_FILE = "run.json";
const DEFAULT_READY_TIMEOUT_MS = 60_000;
const ALIVE_GRACE_MS = 1_000;
const STOP_TIMEOUT_MS = 5_000;
const MAX_QUICK_CRASHES = 5;
/** A process that ran at least this long before exiting crashed "slowly": its restart delay starts over. */
const QUICK_CRASH_MS = 10_000;
/** `http://localhost:<port>` for display and health checks. Built here so callers never hold a URL literal. */
export function localUrl(port, path = "") {
    return `http://localhost:${port}${path}`;
}
/**
 * Expands `${VAR}` and `${VAR:-default}` from `vars`. An unknown variable without a default becomes an empty string, the way a
 * shell expands it, and is reported through `onMissing` so `flisk up` can say which one.
 */
export function expandEnvValue(value, vars, onMissing = () => { }) {
    return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (_match, name, fallback) => {
        const found = vars[name];
        if (found !== undefined && found !== "")
            return found;
        if (fallback !== undefined)
            return fallback;
        onMissing(name);
        return "";
    });
}
/**
 * Start order as waves: every service in a wave depends only on services in earlier waves. Names in `dependsOn` that are not
 * part of the selection are ignored here (planNativeRun reports them). Throws on a cycle; the service config gate refuses
 * cycles first, so this is a safety net.
 */
export function dependencyWaves(services) {
    const names = new Set(services.map((service) => service.name));
    const remaining = new Map(services.map((service) => [service.name, service.dependsOn.filter((dep) => names.has(dep))]));
    const done = new Set();
    const waves = [];
    while (remaining.size > 0) {
        const wave = [...remaining.entries()]
            .filter(([, deps]) => deps.every((dep) => done.has(dep)))
            .map(([name]) => name)
            .sort();
        if (wave.length === 0) {
            throw new FliskError(`circular dependsOn between ${[...remaining.keys()].sort().join(", ")}`, ["Remove one dependsOn entry from the cycle in those services' service.json"]);
        }
        for (const name of wave) {
            remaining.delete(name);
            done.add(name);
        }
        waves.push(wave);
    }
    return waves;
}
/**
 * Turns the selected `command` services into start plans and reports what would stop the run: a dependsOn that is not a service
 * of the selection (a database or the gateway needs Docker for now), and two services on one port.
 */
export function planNativeRun(selected, vars = process.env) {
    const errors = [];
    const missingVars = [];
    const names = new Set(selected.map((resource) => resource.name));
    const portOwners = new Map();
    const services = selected.map((resource) => {
        const config = resource.config ?? {};
        const dependsOn = Array.isArray(config.dependsOn) ? config.dependsOn : [];
        for (const dep of dependsOn) {
            if (!names.has(dep)) {
                errors.push(`service "${resource.name}" dependsOn "${dep}", which is not a service with a command in this project. Shared infrastructure such as a database or the gateway still needs Docker: add a "${dep}" service with a command, or remove it from dependsOn.`);
            }
        }
        const port = typeof config.port === "number" ? config.port : undefined;
        if (port !== undefined) {
            const owner = portOwners.get(port);
            if (owner)
                errors.push(`services "${owner}" and "${resource.name}" both use port ${port}`);
            else
                portOwners.set(port, resource.name);
        }
        const env = {};
        for (const [key, value] of Object.entries(config.env ?? {})) {
            env[key] = expandEnvValue(String(value), { ...vars, ...env }, (name) => missingVars.push(`${resource.name}: ${name}`));
        }
        if (port !== undefined)
            env.PORT = String(port);
        const healthPath = typeof config.healthCheckPath === "string" ? config.healthCheckPath : "";
        return {
            name: resource.name,
            command: String(config.command),
            cwd: resource.path,
            port,
            env,
            dependsOn: dependsOn.filter((dep) => names.has(dep)),
            healthUrl: port !== undefined && healthPath ? localUrl(port, healthPath) : undefined,
            url: port !== undefined ? localUrl(port) : undefined,
            restart: config.restart !== "no",
        };
    });
    try {
        dependencyWaves(services);
    }
    catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
    }
    return { services, errors, missingVars };
}
/** Services whose command starts a program that is not on PATH (a relative path such as ./bin/api is checked in the service directory). */
export function findMissingPrograms(plans, find = findOnPath, exists = existsSync) {
    const missing = [];
    for (const plan of plans) {
        const program = commandProgram(plan.command);
        // A shell builtin or an expression we cannot parse is left to the shell to report.
        if (!program || ["cd", ".", "source", "true", ":"].includes(program))
            continue;
        const found = program.includes("/") ? exists(join(plan.cwd, program)) : Boolean(find(program));
        if (!found)
            missing.push({ name: plan.name, program });
    }
    return missing;
}
/** True when something accepts TCP connections on localhost:port. */
export function isPortListening(port, timeoutMs = 1_000) {
    return new Promise((resolve) => {
        const socket = connect({ host: "localhost", port });
        const finish = (listening) => {
            socket.destroy();
            resolve(listening);
        };
        socket.setTimeout(timeoutMs, () => finish(false));
        socket.once("connect", () => finish(true));
        socket.once("error", () => finish(false));
    });
}
async function healthAnswers(url) {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(2_000), redirect: "manual" });
        await response.body?.cancel();
        return response.status < 400;
    }
    catch {
        return false;
    }
}
/** Polls a plan's readiness signal until it passes, `isAlive` turns false, or the timeout passes. */
export async function waitForServiceReady(plan, options) {
    const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS);
    const interval = options.intervalMs ?? 250;
    if (!plan.healthUrl && plan.port === undefined) {
        await sleep(ALIVE_GRACE_MS);
        return options.isAlive();
    }
    while (Date.now() < deadline) {
        if (!options.isAlive())
            return false;
        const ready = plan.healthUrl
            ? await healthAnswers(plan.healthUrl)
            : await isPortListening(plan.port);
        if (ready)
            return true;
        await sleep(interval);
    }
    return false;
}
function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
export function nativeRunStatePath(projectRoot) {
    return join(projectRoot, NATIVE_DIR, RUN_FILE);
}
export function nativeLogPath(projectRoot, service) {
    return join(projectRoot, NATIVE_DIR, "logs", `${service}.log`);
}
export function readNativeRunState(projectRoot) {
    try {
        const state = JSON.parse(readFileSync(nativeRunStatePath(projectRoot), "utf-8"));
        return state && typeof state.pid === "number" && state.services ? state : null;
    }
    catch {
        return null;
    }
}
function writeNativeRunState(projectRoot, state) {
    const dir = join(projectRoot, NATIVE_DIR);
    mkdirSync(join(dir, "logs"), { recursive: true });
    // Run state and logs are this machine's, never the project's: keep them out of git without touching the user's .gitignore.
    const ignore = join(dir, ".gitignore");
    if (!existsSync(ignore))
        writeFileSync(ignore, "*\n");
    writeFileSync(nativeRunStatePath(projectRoot), `${JSON.stringify(state, null, 2)}\n`);
}
/** True while the process exists (a zombie or another user's process counts as existing). */
export function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code === "EPERM";
    }
}
/** Signals a service's whole process group (the shell and what it started), falling back to the process alone. */
function signalGroup(pid, signal) {
    try {
        process.kill(-pid, signal);
    }
    catch {
        try {
            process.kill(pid, signal);
        }
        catch {
            // Already gone.
        }
    }
}
async function waitForExit(pid, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (!isProcessAlive(pid))
            return true;
        await sleep(100);
    }
    return !isProcessAlive(pid);
}
/** SIGTERM to the process group, SIGKILL after the timeout. */
async function stopProcessGroup(pid, timeoutMs = STOP_TIMEOUT_MS) {
    signalGroup(pid, "SIGTERM");
    if (!(await waitForExit(pid, timeoutMs)))
        signalGroup(pid, "SIGKILL");
}
/**
 * Stops the native run recorded for this project: asks the supervising `flisk up` to stop its services, then stops any service
 * process still alive (a supervisor killed with SIGKILL cannot stop them itself). Returns the services that were stopped.
 */
export async function stopNativeRun(projectRoot, options = {}) {
    const state = readNativeRunState(projectRoot);
    if (!state)
        return { wasRunning: false, services: [] };
    const timeoutMs = options.timeoutMs ?? STOP_TIMEOUT_MS * 2;
    if (state.pid !== process.pid && isProcessAlive(state.pid)) {
        try {
            process.kill(state.pid, "SIGTERM");
        }
        catch {
            // Gone between the check and the signal.
        }
        await waitForExit(state.pid, timeoutMs);
    }
    for (const service of Object.values(state.services)) {
        if (service.pid && isProcessAlive(service.pid))
            await stopProcessGroup(service.pid);
    }
    rmSync(nativeRunStatePath(projectRoot), { force: true });
    return { wasRunning: true, services: Object.keys(state.services), supervisorPid: state.pid };
}
/**
 * Each service's state from the run on record, in the shape `flisk status` reports Tilt's: ready once it passed its readiness
 * check, pending while it starts or the supervisor restarts it, unknown when nothing runs.
 */
export function nativeServiceStates(projectRoot, services) {
    const state = readNativeRunState(projectRoot);
    const isUp = state !== null && isProcessAlive(state.pid);
    return Object.fromEntries(services.map((name) => {
        const service = state?.services[name];
        if (!isUp || !service)
            return [name, { status: "unknown", reason: "not running" }];
        if (!service.pid || !isProcessAlive(service.pid)) {
            return [name, { status: "pending", reason: "restarting" }];
        }
        return service.ready
            ? [name, { status: "ready" }]
            : [name, { status: "pending", reason: "starting" }];
    }));
}
/**
 * The last `tail` lines the given services wrote, oldest first, merged across services by time. `sinceMs` drops lines older
 * than that many milliseconds. A service that wrote nothing yet has no log file and contributes no lines.
 */
export function readNativeLogLines(projectRoot, services, options) {
    const cutoff = options.sinceMs === undefined ? null : (options.now ?? Date.now()) - options.sinceMs;
    const lines = [];
    for (const resource of services) {
        let content;
        try {
            content = readFileSync(nativeLogPath(projectRoot, resource), "utf-8");
        }
        catch {
            continue;
        }
        for (const raw of content.split("\n")) {
            if (!raw)
                continue;
            const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) (.*)$/.exec(raw);
            const time = match?.[1] ?? null;
            if (cutoff !== null && (!time || Date.parse(time) < cutoff))
                continue;
            lines.push({ time, resource, level: null, source: null, text: match?.[2] ?? raw });
        }
    }
    // Stable sort: lines of one service keep their order when two share a millisecond.
    lines.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
    return lines.slice(-options.tail);
}
const PREFIX_COLORS = [chalk.cyan, chalk.magenta, chalk.green, chalk.yellow, chalk.blue, chalk.red];
/** Starts and supervises the planned services. One instance per `flisk up`. */
/**
 * How a service.json `command` line is run: the platform shell, invoked the way Node's `shell: true` does it (`/bin/sh -c`,
 * or `%ComSpec% /d /s /c "<line>"` on Windows), spelled out so the call does not hand an opaque flag to spawn.
 */
export function shellInvocation(command, platform = process.platform, comSpec = process.env.ComSpec) {
    if (platform === "win32") {
        return {
            file: comSpec || "cmd.exe",
            args: ["/d", "/s", "/c", `"${command}"`],
            windowsVerbatimArguments: true,
        };
    }
    return { file: "/bin/sh", args: ["-c", command], windowsVerbatimArguments: false };
}
export class NativeSupervisor {
    projectRoot;
    events;
    options;
    services = new Map();
    startedAt = new Date().toISOString();
    stopping = false;
    constructor(projectRoot, plans, events = {}, options = {}) {
        this.projectRoot = projectRoot;
        this.events = events;
        this.options = options;
        for (const plan of plans) {
            this.services.set(plan.name, {
                plan,
                startedAt: 0,
                quickCrashes: 0,
                gaveUp: false,
                isReady: false,
            });
        }
    }
    /** The width service names are padded to in prefixed output. */
    get prefixWidth() {
        return Math.max(...[...this.services.keys()].map((name) => name.length));
    }
    /**
     * Starts every service once its dependencies are ready. Resolves with the services that never became ready (empty when the
     * whole selection is up); a service whose dependency failed is reported as blocked and never started.
     */
    async start() {
        this.saveState();
        const plans = [...this.services.values()].map((service) => service.plan);
        const ready = new Map();
        const failures = [];
        for (const name of dependencyWaves(plans).flat()) {
            const service = this.services.get(name);
            ready.set(name, (async () => {
                const deps = await Promise.all(service.plan.dependsOn.map((dep) => ready.get(dep)));
                if (!deps.every(Boolean)) {
                    const blockedBy = service.plan.dependsOn.filter((_dep, index) => !deps[index]);
                    failures.push({ name, reason: `not started: ${blockedBy.join(", ")} did not start` });
                    return false;
                }
                if (this.stopping)
                    return false;
                this.spawn(service);
                const isReady = await waitForServiceReady(service.plan, {
                    isAlive: () => !this.stopping && !service.gaveUp,
                    timeoutMs: this.options.readyTimeoutMs,
                });
                if (isReady) {
                    service.isReady = true;
                    this.saveState();
                    this.events.onNote?.(name, "ready");
                }
                else if (!this.stopping) {
                    failures.push({
                        name,
                        reason: service.gaveUp
                            ? "kept exiting; see its output above"
                            : `not ready after ${Math.round((this.options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS) / 1000)}s (${service.plan.healthUrl ? `no answer from ${service.plan.healthUrl}` : `nothing listening on port ${service.plan.port}`})`,
                    });
                }
                return isReady;
            })());
        }
        await Promise.all(ready.values());
        return failures;
    }
    /** Stops every service, dependents before what they depend on, and removes the run state. */
    async stop() {
        if (this.stopping)
            return;
        this.stopping = true;
        const order = dependencyWaves([...this.services.values()].map((s) => s.plan))
            .flat()
            .reverse();
        for (const name of order) {
            const service = this.services.get(name);
            if (service.restartTimer)
                clearTimeout(service.restartTimer);
            const pid = service.child?.pid;
            if (pid && service.child?.exitCode === null && service.child.signalCode === null) {
                await stopProcessGroup(pid);
            }
        }
        rmSync(nativeRunStatePath(this.projectRoot), { force: true });
    }
    /** The current process id of a service, for tests and diagnostics. */
    pidOf(name) {
        return this.services.get(name)?.child?.pid;
    }
    spawn(service) {
        const { plan } = service;
        service.startedAt = Date.now();
        // `command` is a shell command line the project owner wrote in their own service.json (`PORT=1 node s.js`, `$PORT`,
        // `a && b`), run with the same trust as an npm script or a Procfile entry; nothing from outside the project reaches it.
        const shell = shellInvocation(plan.command);
        const child = spawn(shell.file, shell.args, {
            cwd: plan.cwd,
            env: { ...(this.options.baseEnv ?? process.env), ...plan.env },
            windowsVerbatimArguments: shell.windowsVerbatimArguments,
            // Its own process group, so a stop reaches what the shell started too, and a Ctrl+C in the terminal reaches only
            // `flisk up`, which then stops the services in order.
            detached: true,
            stdio: ["ignore", "pipe", "pipe"],
        });
        service.child = child;
        this.events.onNote?.(plan.name, `started: ${plan.command}${child.pid ? ` (pid ${child.pid})` : ""}`);
        this.pipeLines(plan.name, child.stdout, "stdout");
        this.pipeLines(plan.name, child.stderr, "stderr");
        child.once("error", (error) => {
            this.events.onNote?.(plan.name, `could not start: ${error.message}`);
        });
        child.once("exit", (code, signal) => this.onExit(service, child, code, signal));
        this.saveState();
    }
    onExit(service, child, code, signal) {
        if (this.stopping || service.child !== child)
            return;
        service.isReady = false;
        this.saveState();
        const how = signal ? `was stopped by ${signal}` : `exited with code ${code}`;
        if (!service.plan.restart) {
            service.gaveUp = true;
            this.events.onNote?.(service.plan.name, `${how}; not restarting ("restart": "no")`);
            return;
        }
        const ranFor = Date.now() - service.startedAt;
        service.quickCrashes = ranFor < QUICK_CRASH_MS ? service.quickCrashes + 1 : 1;
        if (service.quickCrashes >= MAX_QUICK_CRASHES) {
            service.gaveUp = true;
            this.events.onNote?.(service.plan.name, `${how}; it exited ${MAX_QUICK_CRASHES} times in a row, so it is not restarted. Fix it, then run flisk up again.`);
            return;
        }
        const delay = (this.options.restartDelayMs ?? 1_000) * 2 ** (service.quickCrashes - 1);
        this.events.onNote?.(service.plan.name, `${how}; restarting in ${delay / 1000}s`);
        service.restartTimer = setTimeout(() => {
            if (this.stopping)
                return;
            this.spawn(service);
            void waitForServiceReady(service.plan, {
                isAlive: () => !this.stopping && service.child?.exitCode === null,
                timeoutMs: this.options.readyTimeoutMs,
            }).then((isReady) => {
                if (!isReady || this.stopping)
                    return;
                service.isReady = true;
                this.saveState();
                this.events.onNote?.(service.plan.name, "ready again");
            });
        }, delay);
    }
    pipeLines(name, stream, kind) {
        if (!stream)
            return;
        const logPath = nativeLogPath(this.projectRoot, name);
        let pending = "";
        const emit = (line) => {
            try {
                // A timestamp per line lets `flisk logs` merge services in order and honour --since.
                appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`);
            }
            catch {
                // A full disk must not stop the service; the terminal still shows the line.
            }
            this.events.onLine?.(name, line, kind);
        };
        stream.setEncoding?.("utf-8");
        stream.on("data", (chunk) => {
            const lines = (pending + chunk).split(/\r?\n/);
            pending = lines.pop() ?? "";
            for (const line of lines)
                emit(line);
        });
        stream.on("end", () => {
            if (pending)
                emit(pending);
            pending = "";
        });
    }
    saveState() {
        const services = {};
        for (const [name, service] of this.services) {
            services[name] = {
                pid: service.child?.pid,
                port: service.plan.port,
                url: service.plan.url,
                ready: service.isReady,
            };
        }
        writeNativeRunState(this.projectRoot, {
            pid: process.pid,
            startedAt: this.startedAt,
            services,
        });
    }
}
/** `name | ` in the service's color, padded so the output of several services lines up. */
export function formatPrefix(name, index, width) {
    const color = PREFIX_COLORS[index % PREFIX_COLORS.length] ?? chalk.cyan;
    return color(`${name.padEnd(width)} | `);
}
