// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { readEnvFileValues } from "./env-selection.js";
import { showError } from "./errors.js";
import { formatCount } from "./formatting.js";
import { ensureGeneratedSecrets } from "./generated-secrets.js";
import { isDockerRunning } from "./native-container.js";
import { dependencyWaves, findMissingPrograms, formatPrefix, isPortListening, isProcessAlive, NATIVE_DIR, NativeSupervisor, nativeRunStatePath, planNativeRun, readNativeLogLines, readNativeRunState, stopNativeRun, } from "./native-runtime.js";
import { findPortOccupant } from "./port-occupant.js";
import { readProjectNameOrUndefined } from "./project-reader.js";
import { databaseResourceNames, namesSharedPlatformPostgres } from "./shared-platform-postgres.js";
import { describeToolchainFinding, findToolchainMismatches } from "./toolchain.js";
import { attachedUpInCiWarning } from "./up-hints.js";
/** Lines of a failed service's own output a failed `up` carries, and the most characters of one line. */
const FAILURE_LOG_LINES = 5;
const FAILURE_LOG_LINE_CHARS = 400;
const FAILURE_LOG_SCAN_LINES = 200;
/** Consecutive identical lines folded into one, with how many times it came ("line (x3)"). */
function collapseRepeats(lines) {
    const out = [];
    let count = 0;
    for (const [i, line] of lines.entries()) {
        count += 1;
        if (line !== lines[i + 1]) {
            out.push(count > 1 ? `${line} (x${count})` : line);
            count = 0;
        }
    }
    return out;
}
/**
 * Each failure with the last lines its service wrote (`logs`). The reason alone ("kept exiting; see its output above")
 * points at output that a `--json` or MCP caller never saw, so the cause (a missing variable, a stack trace) travels with
 * the failure. Lines come from `.flisk/native/logs`, which the supervisor masked when it wrote them; a service that
 * wrote nothing, or was never started, keeps its failure as it was. With `sinceEpochMs`, lines from earlier runs (the logs
 * are appended to) are left out.
 */
export function withFailureLogs(projectRoot, failures, sinceEpochMs) {
    return failures.map((failure) => {
        // A crash loop repeats one line on every restart; reading further back and folding repeats shows what came before it.
        const lines = readNativeLogLines(projectRoot, [failure.name], {
            tail: FAILURE_LOG_SCAN_LINES,
            ...(sinceEpochMs === undefined ? {} : { sinceMs: Date.now() - sinceEpochMs }),
        })
            .map((line) => line.text.trimEnd())
            .filter((text) => text.trim());
        const logs = collapseRepeats(lines)
            .slice(-FAILURE_LOG_LINES)
            .map((text) => text.length > FAILURE_LOG_LINE_CHARS
            ? `${text.slice(0, FAILURE_LOG_LINE_CHARS - 1)}…`
            : text);
        return logs.length > 0 ? { ...failure, logs } : failure;
    });
}
/** Variables `${VAR}` in a service's env may reference: the env file of the run, overridden by the shell. */
/** What a local process starts with: the project .env (or --env-file), overridden by the shell. */
export function runVariables(projectRoot, envFilePath) {
    const path = envFilePath ?? join(projectRoot, ".env");
    const fromFile = existsSync(path) ? Object.fromEntries(readEnvFileValues(path)) : {};
    const fromShell = Object.fromEntries(Object.entries(process.env).filter((entry) => entry[1] !== undefined));
    return { ...fromFile, ...fromShell };
}
/**
 * Names (never values) of variables the .env sets that the shell overrides with a different value. A restart
 * re-reads the .env but the shell of the running `flisk up` still wins, so an edit to these has no effect.
 */
export function shadowedEnvKeys(projectRoot, envFilePath, shell = process.env) {
    const path = envFilePath ?? join(projectRoot, ".env");
    if (!existsSync(path))
        return [];
    return [...readEnvFileValues(path)]
        .filter(([key, value]) => shell[key] !== undefined && shell[key] !== value)
        .map(([key]) => key)
        .sort();
}
/**
 * Env entries that override the project .env for a local service. The .env can still hold the Docker host's
 * DATABASE_URL; a service with no database in dependsOn must read it as empty, or its /health check pings a host
 * that does not exist and never goes healthy (#4456). A service that does depend on the database keeps the value.
 */
export function localDatabaseEnv(dependsOn, databaseNames = [], declaredEnv = {}) {
    // A DATABASE_URL the service declares in its own service.json env is the author's choice: it is never blanked.
    if (declaredEnv.DATABASE_URL !== undefined && declaredEnv.DATABASE_URL !== "")
        return {};
    return dependsOn.some((name) => namesSharedPlatformPostgres(name, databaseNames))
        ? {}
        : { DATABASE_URL: "" };
}
/**
 * `flisk up` for a selection where every service declares `command`: no Docker, no Compose, no Tilt and no generated files.
 * Resolves only when the run ends (Ctrl+C, `flisk down`, or a failed start, which exits 1).
 */
export async function runNativeUp(input) {
    const { projectRoot, selected, emit } = input;
    const exit = input.exit ?? ((code) => process.exit(code));
    const quiet = Boolean(input.quiet);
    const fail = (code, message, data = {}) => {
        emit?.({ ok: false, runtime: "native", ...data }, [{ code, message }]);
        showError(message);
        return exit(1);
    };
    // Names a service declares in secrets.generate are written once to the env file before anything starts (never printed).
    const generatedNames = ensureGeneratedSecrets(projectRoot, selected, {
        envFilePath: input.envFilePath,
        dryRun: input.dryRun,
    });
    if (generatedNames.length > 0 && !quiet && !input.dryRun) {
        console.log(chalk.gray(`Generated ${generatedNames.join(", ")} into the env file (once; existing values unchanged)`));
    }
    const vars = runVariables(projectRoot, input.envFilePath);
    const plan = planNativeRun(selected, vars, projectRoot, readProjectNameOrUndefined(projectRoot));
    if (plan.errors.length > 0)
        fail("INVALID_SERVICE_CONFIG", plan.errors.join("\n"));
    const databaseNames = databaseResourceNames(selected);
    for (const service of plan.services) {
        if (!service.container) {
            Object.assign(service.env, localDatabaseEnv(service.dependsOn, databaseNames, service.env));
        }
    }
    // A "toolchain" in service.json is binding: a service on the wrong runtime fails later in ways that never name the version.
    const toolchainMismatches = findToolchainMismatches(selected).filter((finding) => !finding.isHint);
    if (toolchainMismatches.length > 0) {
        fail("TOOLCHAIN_MISMATCH", `${toolchainMismatches.map(describeToolchainFinding).join("\n")}\nSwitch to that version with your version manager, or change "toolchain" in the service.json.`);
    }
    if (plan.missingVars.length > 0 && !quiet) {
        console.warn(chalk.yellow(`Unset variables expanded to an empty value: ${plan.missingVars.join(", ")}. Set them in .env or the shell.`));
    }
    const missing = findMissingPrograms(plan.services);
    if (missing.length > 0) {
        fail("NATIVE_COMMAND_NOT_FOUND", missing
            .map(({ name, program }) => `service "${name}" runs ${program}, which is not installed (not found on PATH). Install it, or change "command" in its service.json.`)
            .join("\n"));
    }
    const containers = plan.services.filter((service) => service.container);
    const serviceNames = plan.services.map((service) => service.name);
    const startOrder = dependencyWaves(plan.services);
    const description = input.only
        ? `${formatCount(input.only.length, "requested service")}${input.dependencies.length > 0 ? ` plus ${input.dependencies.join(", ")}` : ""}`
        : input.stackName
            ? `stack "${input.stackName}"`
            : formatCount(serviceNames.length, "service");
    if (!quiet) {
        console.log(chalk.blue(`${input.dryRun ? "Would start" : "Starting"} ${description} as local processes${containers.length > 0 ? `, ${containers.map((service) => service.name).join(", ")} with docker run (no Tilt)` : " (no Docker, no Tilt)"}...`));
        for (const service of plan.services) {
            const after = service.dependsOn.length > 0 ? ` (after ${service.dependsOn.join(", ")})` : "";
            const what = service.container
                ? `container ${String(selected.find((resource) => resource.name === service.name)?.config?.image)}`
                : service.command;
            console.log(chalk.gray(`  - ${service.name}: ${what}${after}`));
        }
    }
    if (input.dryRun) {
        emit?.({
            ok: true,
            dryRun: true,
            runtime: "native",
            ...(input.inferred ? { inferred: input.inferred } : {}),
            stack: input.stackName ?? null,
            services: serviceNames,
            ...(input.only ? { requested: input.only, declaredDependencies: input.dependencies } : {}),
            startOrder,
            ...(containers.length > 0 ? { containers: containers.map((service) => service.name) } : {}),
        });
        if (!quiet)
            console.log(chalk.yellow("Dry run: not starting services"));
        return;
    }
    const running = readNativeRunState(projectRoot);
    if (running && running.pid !== process.pid && isProcessAlive(running.pid)) {
        if (!input.force) {
            const message = `This project is already running as local processes (flisk up, pid ${running.pid}).`;
            emit?.({ ok: true, alreadyRunning: true, runtime: "native", pid: running.pid });
            if (!quiet) {
                console.log(chalk.green(message));
                console.log(chalk.gray("Stop it with flisk down, or pass --force to restart it."));
            }
            return;
        }
    }
    if (running) {
        // A previous run that was replaced (--force) or killed without cleaning up: stop whatever it left behind.
        await stopNativeRun(projectRoot);
    }
    if (containers.length > 0 && !isDockerRunning()) {
        fail("DOCKER_NOT_RUNNING", `${containers.map((service) => service.name).join(", ")} run from an image, which needs Docker, and Docker is not running. Start Docker Desktop, OrbStack, Colima or Kiri, then run flisk up again.`);
    }
    for (const service of plan.services) {
        if (service.port !== undefined && (await isPortListening(service.port))) {
            const occupant = findPortOccupant(service.port);
            fail("PORT_IN_USE", `Port ${service.port} for service "${service.name}" is already in use${occupant ? ` by ${occupant.command} (pid ${occupant.pid})` : ""}. Stop it, or change "port" in the service.json.`);
        }
    }
    const width = Math.max(...serviceNames.map((name) => name.length));
    const prefix = (name) => formatPrefix(name, serviceNames.indexOf(name), width);
    const supervisor = new NativeSupervisor(projectRoot, plan.services, {
        onLine: quiet ? undefined : (name, line) => console.log(`${prefix(name)}${line}`),
        onNote: quiet
            ? undefined
            : (name, message) => console.log(`${prefix(name)}${chalk.gray(`[flisk] ${message}`)}`),
    }, {
        readyTimeoutMs: input.readyTimeoutMs,
        baseEnv: vars,
        extraEnvPaths: input.envFilePath ? [input.envFilePath] : [],
        // A restart (`flisk restart`, the MCP resource_restart) re-reads the .env, so a repaired value takes effect.
        reload: () => {
            const fresh = runVariables(projectRoot, input.envFilePath);
            const shadowed = shadowedEnvKeys(projectRoot, input.envFilePath);
            if (shadowed.length > 0 && !quiet) {
                console.log(chalk.yellow(`[flisk] ${shadowed.join(", ")} set in .env but overridden by the shell that started \`flisk up\`; a restart keeps the shell value. Unset it and run \`flisk down\` then \`flisk up\`.`));
            }
            const replanned = planNativeRun(selected, fresh, projectRoot, readProjectNameOrUndefined(projectRoot));
            if (replanned.errors.length > 0)
                throw new Error(replanned.errors.join("\n"));
            for (const service of replanned.services) {
                if (!service.container) {
                    Object.assign(service.env, localDatabaseEnv(service.dependsOn, databaseNames, service.env));
                }
            }
            return { plans: replanned.services, baseEnv: fresh };
        },
    });
    let stopping;
    const stopAndExit = (code) => {
        stopping ??= (async () => {
            if (!quiet)
                console.log(chalk.gray("\nStopping local processes..."));
            await supervisor.stop();
            exit(code);
        })();
    };
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
        process.on(signal, () => stopAndExit(0));
    }
    // If every service exits for good, nothing keeps `flisk up` alive; it ends and must not leave a run.json behind.
    process.once("exit", () => {
        if (readNativeRunState(projectRoot)?.pid === process.pid) {
            rmSync(nativeRunStatePath(projectRoot), { force: true });
        }
    });
    // The service logs are appended to across runs: only lines written since this start can explain this failure.
    const startedAt = Date.now() - 1000;
    const started = await supervisor.start();
    if (stopping)
        return;
    if (started.length > 0) {
        const failures = withFailureLogs(projectRoot, started, startedAt);
        const message = [
            "Local processes did not start:",
            // Quiet (--json, MCP): nothing was printed above, so each failure carries its service's last lines.
            ...failures.flatMap((failure) => [
                `  ✗ ${failure.name}: ${failure.reason}`,
                ...(quiet ? (failure.logs ?? []).map((line) => `      ${line}`) : []),
            ]),
            `Output of every service: ${join(NATIVE_DIR, "logs")}/<service>.log`,
        ].join("\n");
        emit?.({ ok: false, runtime: "native", failures }, [{ code: "UP_RESOURCE_FAILED", message }]);
        showError(message);
        await supervisor.stop();
        exit(1);
        return;
    }
    emit?.({
        ok: true,
        runtime: "native",
        ...(input.inferred ? { inferred: true } : {}),
        stack: input.stackName ?? null,
        services: serviceNames,
        ...(input.only ? { requested: input.only, dependencies: input.dependencies } : {}),
        urls: Object.fromEntries(plan.services.flatMap((service) => (service.url ? [[service.name, service.url]] : []))),
    });
    if (!quiet) {
        const lines = [
            containers.length > 0
                ? `Flisk is up (local processes, ${formatCount(containers.length, "container")} with docker run).`
                : "Flisk is up (local processes, no Docker).",
            "Services:",
        ];
        for (const service of plan.services) {
            const health = service.healthUrl ? ` (health: ${service.healthUrl})` : "";
            lines.push(`  ✓ ${service.name}${service.url ? ` → ${service.url}` : ""}${health}`);
        }
        lines.push("Stop: Ctrl+C here, or flisk down from another terminal");
        lines.push(`Logs: flisk logs --service <name>, or ${join(NATIVE_DIR, "logs")}/<service>.log`);
        for (const line of lines)
            console.log(chalk.blue(line));
        const ciWarning = attachedUpInCiWarning(process.env);
        if (ciWarning)
            console.log(chalk.yellow(ciWarning));
    }
    // The services keep the process alive; `flisk up` ends when it is stopped.
    await new Promise(() => { });
}
