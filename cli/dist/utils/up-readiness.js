// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile, execFileSync } from "node:child_process";
import { findStaleDisabledResources, getDeferredResourceNames, parseTiltResourceFailures, } from "./doctor-runtime.js";
import { isHealthCheckDisabled } from "./service-manifest.js";
import { discoverResources } from "./services.js";
import { effectiveRuntimeStatus } from "./tilt-resource-state.js";
import { findOnPath } from "./which.js";
export { findStaleDisabledResources };
export function tiltGetUiResources(port) {
    return new Promise((resolve) => {
        execFile(findOnPath("tilt") ?? "tilt", ["get", "uiresources", "-o", "json", "--port", String(port)], { timeout: 15_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => resolve(error ? null : stdout));
    });
}
export function tiltResourceLogs(port, name) {
    return new Promise((resolve) => {
        execFile(findOnPath("tilt") ?? "tilt", ["logs", name, "--port", String(port)], { timeout: 15_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => resolve(error ? null : stdout));
    });
}
/**
 * Tilt lists resources outside the current focus (the other release phases, or everything but a `--only` selection) with
 * `disableStatus.state: Disabled` and both statuses `none`, which would read as pending forever. A resource whose update
 * status is `not_applicable` (a serve-only local resource) has nothing to build, so it counts as built.
 * When health checks are disabled for a resource (`disabledHealth`), its container health check status is stripped so
 * running containers are considered ready immediately. The same goes for a container Docker reports unhealthy when
 * `probeCannotRun` says its health command cannot run at all (see `healthProbeCannotRun`).
 */
export function onlyEnabledResources(jsonText, disabledHealth, probeCannotRun) {
    const parsed = JSON.parse(jsonText);
    const items = (parsed.items ?? [])
        .filter((item) => item.status?.disableStatus?.state !== "Disabled")
        .map((item) => {
        let current = item;
        if (current.status?.updateStatus === "not_applicable") {
            current = { ...current, status: { ...current.status, updateStatus: "ok" } };
        }
        const name = current.metadata?.name;
        const health = current.status?.composeResourceInfo?.healthStatus;
        if (name &&
            current.status?.composeResourceInfo &&
            ((disabledHealth?.has(name) ?? false) ||
                (health === "unhealthy" && probeCannotRun?.(name) === true))) {
            const { healthStatus: _healthStatus, ...restInfo } = current.status.composeResourceInfo;
            current = {
                ...current,
                status: {
                    ...current.status,
                    composeResourceInfo: restInfo,
                },
            };
        }
        return current;
    });
    return JSON.stringify({ items });
}
/**
 * True when the container of a Compose service is running and every health probe Docker recorded exited 126 or 127, which
 * is a shell saying the probe command is missing or not executable (`curl: not found` in an image without curl, as in
 * LycheeOrg/Lychee's facial-recognition sidecar). Such a probe says nothing about the app, so it must not fail `flisk up`.
 * A probe that runs and fails (any other exit code) is a real failure. Docker not answering is "no", never "yes".
 */
export function healthProbeCannotRun(service) {
    try {
        const ids = execFileSync("docker", ["ps", "-q", "--filter", `label=com.docker.compose.service=${service}`], { encoding: "utf-8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] })
            .split("\n")
            .filter(Boolean);
        if (ids.length !== 1)
            return false;
        const out = execFileSync("docker", [
            "inspect",
            "--format",
            "{{.State.Status}} {{range .State.Health.Log}}{{.ExitCode}} {{end}}",
            ids[0],
        ], { encoding: "utf-8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] });
        const [status, ...codes] = out.trim().split(/\s+/);
        return (status === "running" && codes.length > 0 && codes.every((c) => c === "126" || c === "127"));
    }
    catch {
        return false;
    }
}
export function getDisabledHealthResourceNames(resources) {
    try {
        const list = resources ?? discoverResources();
        return new Set(list.filter((svc) => isHealthCheckDisabled(svc.config)).map((svc) => svc.name));
    }
    catch {
        return new Set();
    }
}
function enabledNames(jsonText) {
    return (JSON.parse(jsonText).items ?? [])
        .filter((item) => item.status?.disableStatus?.state !== "Disabled")
        .flatMap((item) => (item.metadata?.name ? [item.metadata.name] : []));
}
/**
 * Services the caller asked for must not vanish into the disabled filter: one that Tilt lists as disabled (it can be
 * disabled while running) is a failure, and one Tilt does not list yet is still pending.
 */
export function checkExpectedResources(jsonText, expected) {
    const items = JSON.parse(jsonText).items ?? [];
    const byName = new Map(items.map((item) => [item.metadata?.name, item]));
    return {
        missing: expected.filter((name) => !byName.has(name)),
        disabled: expected.filter((name) => byName.get(name)?.status?.disableStatus?.state === "Disabled"),
    };
}
/** Resources that report on the stack without gating it. */
export function isAdvisoryResource(name) {
    return name.endsWith("-typecheck");
}
/**
 * One look at `tilt get uiresources -o json`. `settled` means polling can stop: everything is ready, or the rest has
 * finished with a failure (an errored resource, or an expected service Tilt has disabled).
 */
export function evaluateTiltReadiness(jsonText, deferred, expected, disabledHealth, probeCannotRun) {
    const parsed = parseTiltResourceFailures(onlyEnabledResources(jsonText, disabledHealth, probeCannotRun), deferred);
    // A `<service>-typecheck` resource runs on the host and is advisory: it reports type errors
    // in Tilt, it does not decide whether the stack is up. It must not fail the stack.
    const blocking = parsed.failures.filter((failure) => !isAdvisoryResource(failure.name));
    const unhealthyButRunning = unhealthyRunningNames(jsonText);
    let result = {
        ready: blocking.length === 0 && parsed.pendingCount === 0 && parsed.okCount > 0,
        failures: blocking.map((failure) => ({
            name: failure.name,
            message: failure.error || `${failure.updateStatus}/${failure.runtimeStatus}`,
            ...(unhealthyButRunning.has(failure.name) ? { runtime: true } : {}),
        })),
        pending: parsed.pendingCount,
        timedOut: false,
        enabled: enabledNames(jsonText),
    };
    if (expected && expected.length > 0) {
        const { missing, disabled } = checkExpectedResources(jsonText, expected);
        if (missing.length > 0) {
            result = { ...result, ready: false, pending: result.pending + missing.length };
        }
        if (disabled.length > 0) {
            return {
                settled: true,
                result: {
                    ...result,
                    ready: false,
                    failures: [
                        ...result.failures,
                        ...disabled.map((name) => ({ name, message: "disabled in Tilt" })),
                    ],
                },
            };
        }
    }
    return {
        result,
        settled: result.ready || (result.failures.length > 0 && result.pending === 0),
    };
}
export function findBuildingResourceNames(jsonText, deferred) {
    try {
        const parsed = JSON.parse(jsonText);
        return (parsed.items ?? [])
            .filter((item) => {
            const name = item.metadata?.name;
            if (!name || name === "(Tiltfile)" || deferred?.has(name) || isAdvisoryResource(name)) {
                return false;
            }
            if (item.status?.disableStatus?.state === "Disabled")
                return false;
            return item.status?.updateStatus === "in_progress";
        })
            .map((item) => item.metadata?.name);
    }
    catch {
        return [];
    }
}
export function findPendingResourceNames(jsonText, deferred) {
    try {
        const parsed = JSON.parse(jsonText);
        return (parsed.items ?? [])
            .filter((item) => {
            const name = item.metadata?.name;
            if (!name || name === "(Tiltfile)" || deferred?.has(name) || isAdvisoryResource(name)) {
                return false;
            }
            if (item.status?.disableStatus?.state === "Disabled")
                return false;
            const update = item.status?.updateStatus ?? "";
            const runtime = effectiveRuntimeStatus(item.status);
            if (update === "error" || runtime === "error")
                return false;
            return update !== "ok" || runtime !== "ok";
        })
            .map((item) => item.metadata?.name);
    }
    catch {
        return [];
    }
}
export function formatTail(text, maxLines = 10) {
    const lines = text
        .trimEnd()
        .split("\n")
        .map((l) => l.trimEnd())
        .filter((l) => l.length > 0);
    return lines.slice(-maxLines).join("\n");
}
function stateFingerprint(jsonText) {
    try {
        const parsed = JSON.parse(jsonText);
        return (parsed.items ?? [])
            .map((i) => {
            const s = i.status;
            return `${i.metadata?.name}:${s?.updateStatus}:${s?.runtimeStatus}:${s?.disableStatus?.state}:${s?.composeResourceInfo?.healthStatus}:${s?.currentBuild?.startTime}:${s?.buildHistory?.length}`;
        })
            .join(";");
    }
    catch {
        return jsonText;
    }
}
/**
 * Containers that built and are running but whose health check fails. Unlike an exited container (a migrator that failed,
 * a crash) these can still turn healthy by themselves.
 */
function unhealthyRunningNames(jsonText) {
    try {
        const parsed = JSON.parse(jsonText);
        return new Set((parsed.items ?? [])
            .filter((item) => item.status?.updateStatus !== "error" &&
            // A container that exited keeps its last health status; only a running one can still turn healthy.
            item.status?.runtimeStatus === "ok" &&
            item.status
                ?.composeResourceInfo?.healthStatus === "unhealthy")
            .map((item) => item.metadata?.name));
    }
    catch {
        return new Set();
    }
}
/** How long `flisk up` keeps waiting on a container that built but is failing at runtime before it reports a failure. */
export const DEFAULT_FAILURE_GRACE_MS = 120_000;
/**
 * True while every failure is a runtime one (the container is running; its health check fails) and each of them began
 * less than `graceMs` ago. `failingSince` holds when each resource started failing, so a container that turns unhealthy
 * late gets its own full window instead of inheriting an earlier container's. A database on its first start initialises its data directory and fails its health check
 * for a while: `flisk up` used to print "db failed" and stop waiting, and a few minutes later every container was healthy.
 * A build error never recovers by itself, so it still ends the wait at once.
 */
export function withinFailureGrace(result, failingSince, now, graceMs) {
    if (result.failures.length === 0)
        return false;
    return result.failures.every((failure) => {
        const since = failingSince.get(failure.name);
        return failure.runtime === true && since !== undefined && now - since < graceMs;
    });
}
/** Records when each currently failing resource started failing and forgets the ones that recovered. */
export function trackFailingSince(failingSince, failures, now) {
    const current = new Set(failures.map((failure) => failure.name));
    for (const name of [...failingSince.keys()]) {
        if (!current.has(name))
            failingSince.delete(name);
    }
    for (const name of current) {
        if (!failingSince.has(name))
            failingSince.set(name, now);
    }
}
/** FLISK_UP_FAILURE_GRACE_MS when it is a finite, non-negative number; otherwise the default. */
export function failureGraceFromEnv(value) {
    const parsed = value === undefined || value.trim() === "" ? Number.NaN : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_FAILURE_GRACE_MS;
}
/**
 * Waits until every non-deferred Tilt resource is built and running. Resolves not-ready as soon as the rest has settled
 * with an errored resource, or after a period of no progress (progress-aware timeout). While builds or image pulls
 * produce output, the wait does not time out. Sablier-deferred resources are excluded: they stay idle by design.
 */
export async function waitForTiltResourcesReady(port, options = {}) {
    const timeoutMs = options.timeoutMs ?? Number(process.env.FLISK_UP_READY_TIMEOUT_MS ?? 900_000);
    const intervalMs = options.intervalMs ?? 2_000;
    const fetchJson = options.fetchJson ?? tiltGetUiResources;
    const fetchLogs = options.fetchLogs ??
        (options.fetchJson && options.fetchJson !== tiltGetUiResources
            ? async () => null
            : tiltResourceLogs);
    const deferred = options.deferred ?? getDeferredResourceNames();
    const disabledHealth = options.disabledHealth ?? getDisabledHealthResourceNames();
    const now = options.now ?? Date.now;
    const failureGraceMs = options.failureGraceMs ?? failureGraceFromEnv(process.env.FLISK_UP_FAILURE_GRACE_MS);
    const failingSince = new Map();
    let lastProgressAt = now();
    let previousFingerprint = "";
    const previousLogLengths = new Map();
    let lastJsonText = null;
    let last = {
        ready: false,
        failures: [],
        pending: 0,
        timedOut: false,
        enabled: [],
    };
    for (;;) {
        const text = await fetchJson(port);
        if (text) {
            lastJsonText = text;
            try {
                const evaluation = evaluateTiltReadiness(text, deferred, options.expected, disabledHealth, healthProbeCannotRun);
                last = evaluation.result;
                trackFailingSince(failingSince, last.failures, now());
                if (evaluation.settled && !withinFailureGrace(last, failingSince, now(), failureGraceMs)) {
                    return last;
                }
                if (last.failures.length > 0 &&
                    !withinFailureGrace(last, failingSince, now(), failureGraceMs) &&
                    options.isStalled?.(text)) {
                    return last;
                }
                const currentFingerprint = stateFingerprint(text);
                if (currentFingerprint !== previousFingerprint) {
                    previousFingerprint = currentFingerprint;
                    lastProgressAt = now();
                }
                else {
                    // While building, check if active builds are producing output.
                    const building = findBuildingResourceNames(text, deferred);
                    if (building.length > 0) {
                        for (const name of building) {
                            const logs = await fetchLogs(port, name);
                            if (logs !== null) {
                                const prev = previousLogLengths.get(name);
                                if (prev === undefined || logs.length !== prev) {
                                    previousLogLengths.set(name, logs.length);
                                    lastProgressAt = now();
                                }
                            }
                        }
                    }
                }
            }
            catch {
                /* Tilt may emit partial output while starting; retry. */
            }
        }
        if (now() - lastProgressAt >= timeoutMs) {
            const stillBuilding = lastJsonText ? findBuildingResourceNames(lastJsonText, deferred) : [];
            const pendingNames = lastJsonText ? findPendingResourceNames(lastJsonText, deferred) : [];
            const unfinished = [...new Set([...stillBuilding, ...pendingNames])];
            const lastLogs = {};
            for (const name of unfinished) {
                try {
                    const logs = await fetchLogs(port, name);
                    if (logs && logs.trim().length > 0) {
                        lastLogs[name] = formatTail(logs, 10);
                    }
                }
                catch {
                    // Ignore log retrieval failure on timeout
                }
            }
            return {
                ...last,
                ready: false,
                timedOut: true,
                stillBuilding,
                lastLogs: Object.keys(lastLogs).length > 0 ? lastLogs : undefined,
            };
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
}
