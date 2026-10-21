// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile } from "node:child_process";
import { realpathSync, statfsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { DISK_WARN_GIB } from "./doctor-host.js";
import { findProjectTiltUpPids, projectNetworkNames, tdkNetworkOwner, tdkNetworkPrefixes, } from "./down-cleanup.js";
import { executableName, legacyExecutableName } from "./platform.js";
import { tiltGetUiResources } from "./up-readiness.js";
import { findAllOnPath } from "./which.js";
const execFilePromise = promisify(execFile);
const DOCKER_TIMEOUT_MS = 15_000;
/** The networks `flisk doctor` creates to test capacity; an interrupted run leaves one behind. */
const PROBE_NETWORK = /^flisk_doctor_probe_(\d+)$/;
const runDocker = async (args) => {
    const { stdout } = await execFilePromise("docker", args, {
        encoding: "utf-8",
        timeout: DOCKER_TIMEOUT_MS,
        windowsHide: true,
    });
    return stdout;
};
function firstLine(error) {
    const stderr = String(error.stderr ?? error).trim();
    return stderr.split(/\r?\n/)[0] ?? "";
}
const STALE_TILT_MIN_AGE_S = 120;
/** `ps -o etime=` ("[[dd-]hh:]mm:ss") in seconds. */
export function parseElapsed(etime) {
    const match = /^\s*(?:(?:(\d+)-)?(\d+):)?(\d+):(\d+)\s*$/.exec(etime);
    if (!match)
        return null;
    const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
    return ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds);
}
/**
 * Whether any of `ports` answers as a Tilt UI. A busy Tilt can miss one request, and a wrong "stale" ends in a kill,
 * so a port gets a second try before it counts as silent.
 */
export async function anyTiltAnswers(ports, probe = tiltGetUiResources, attempts = 2, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
    for (let attempt = 0; attempt < attempts; attempt++) {
        if (attempt > 0)
            await wait(1000);
        for (const port of ports) {
            if ((await probe(port)) !== null)
                return true;
        }
    }
    return false;
}
async function tiltProcessStatus(pid) {
    if (process.platform === "win32")
        return "unknown";
    try {
        const { stdout: etime } = await execFilePromise("ps", ["-p", String(pid), "-o", "etime="], {
            encoding: "utf-8",
            timeout: 5000,
        });
        const age = parseElapsed(etime);
        // A Tilt that is still starting has not bound its port yet.
        if (age === null || age < STALE_TILT_MIN_AGE_S)
            return "unknown";
        const { stdout } = await execFilePromise("lsof", ["-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN", "-Fn"], { encoding: "utf-8", timeout: 5000 });
        const ports = [...stdout.matchAll(/^n.*:(\d+)$/gm)].map((m) => Number(m[1]));
        return (await anyTiltAnswers(ports)) ? "healthy" : "stale";
    }
    catch {
        // No lsof, or the process is gone: do not guess.
        return "unknown";
    }
}
export function createDockerFixDeps(run = runDocker) {
    return {
        async listNetworks() {
            const names = (await run(["network", "ls", "--format", "{{.Name}}"]))
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean);
            // One inspect per network: another process (a doctor probe, `flisk down`) can remove one mid-listing, and a
            // batched inspect would then fail for all of them.
            const inspected = await Promise.all(names.map(async (name) => {
                try {
                    const count = await run([
                        "network",
                        "inspect",
                        "--format",
                        "{{len .Containers}}",
                        name,
                    ]);
                    return { name, containers: Number(count.trim()) || 0 };
                }
                catch (error) {
                    if (/no such network|not found/i.test(String(error)))
                        return null;
                    throw error;
                }
            }));
            return inspected.filter((network) => network !== null);
        },
        async removeNetwork(name) {
            try {
                await run(["network", "rm", name]);
            }
            catch (error) {
                throw new Error(firstLine(error));
            }
        },
        freeDiskGib() {
            try {
                const stats = statfsSync(homedir());
                return (Number(stats.bavail) * Number(stats.bsize)) / 1024 ** 3;
            }
            catch {
                return null;
            }
        },
        async reclaimable() {
            let buildCache = null;
            try {
                const df = await run(["system", "df", "--format", "{{.Type}}\t{{.Reclaimable}}"]);
                for (const line of df.split(/\r?\n/)) {
                    const [type, size] = line.split("\t");
                    // "1.531GB" or "1.5GB (39%)"; the percentage is of the whole, not useful here.
                    if (type === "Build Cache" && size)
                        buildCache = size.replace(/\s*\(.*\)/, "").trim();
                }
            }
            catch {
                // Leave unknown.
            }
            let danglingImages = 0;
            try {
                const ids = await run(["images", "-q", "-f", "dangling=true"]);
                danglingImages = ids.split(/\r?\n/).filter(Boolean).length;
            }
            catch {
                // Leave zero.
            }
            return { buildCache, danglingImages };
        },
        async prune(kind) {
            try {
                // Never `volume prune`, never `-a`: only the build cache and untagged images.
                await run(kind === "builder" ? ["builder", "prune", "-f"] : ["image", "prune", "-f"]);
            }
            catch (error) {
                throw new Error(firstLine(error));
            }
        },
        async tiltStatus(pid) {
            return tiltProcessStatus(pid);
        },
        stopProcess(pid) {
            process.kill(pid, "SIGTERM");
        },
        isProcessAlive(pid) {
            try {
                process.kill(pid, 0);
                return true;
            }
            catch (error) {
                // EPERM means the process exists but belongs to someone else.
                return error.code === "EPERM";
            }
        },
    };
}
export const dockerFixDeps = createDockerFixDeps();
/**
 * What `--fix` would do: stop this project's stale Tilt; remove unused networks that are a leftover doctor probe or
 * this project's own (the exact names the engine creates, skipped while its Tilt runs). Other Flisk projects' unused
 * networks are planned only with `context.machine`, each naming its owner.
 */
export async function planDoctorFixes(projectName, deps = dockerFixDeps, context = {}) {
    const actions = [];
    // A Tilt that has run a while without serving its UI is stale and may be stopped; any other Tilt of this project is
    // running or starting, and its networks are not to be touched.
    const liveTilt = [];
    for (const pid of context.tiltPids ?? []) {
        if ((await deps.tiltStatus(pid)) === "stale") {
            actions.push({
                id: `stop-tilt:${pid}`,
                check: "Tilt processes",
                scope: "project",
                command: `kill -TERM ${pid}`,
                status: "planned",
                reason: "this project's Tilt is running but its UI does not answer",
            });
        }
        else {
            liveTilt.push(pid);
        }
    }
    const projectBusy = liveTilt.length > 0
        ? `Tilt is running for this project (pid ${liveTilt.join(", ")}); run flisk down first`
        : undefined;
    const networks = await deps.listNetworks();
    const freeGib = deps.freeDiskGib();
    if (freeGib !== null && freeGib < DISK_WARN_GIB) {
        const { buildCache, danglingImages } = await deps.reclaimable();
        const low = `${freeGib.toFixed(1)} GB free`;
        if (buildCache && !/^0(\.0+)?\s*B$/i.test(buildCache)) {
            actions.push({
                id: "prune:builder",
                check: "Disk Space",
                scope: "host",
                command: "docker builder prune -f",
                status: "planned",
                reason: `${low}; ${buildCache} of build cache reclaimable`,
            });
        }
        if (danglingImages > 0) {
            actions.push({
                id: "prune:images",
                check: "Disk Space",
                scope: "host",
                command: "docker image prune -f",
                status: "planned",
                reason: `${low}; ${danglingImages} untagged image${danglingImages === 1 ? "" : "s"}`,
            });
        }
    }
    const own = new Set(projectName ? projectNetworkNames(projectName) : []);
    const prefixes = tdkNetworkPrefixes(networks.map((network) => network.name));
    for (const network of networks) {
        const probe = PROBE_NETWORK.exec(network.name);
        let scope;
        let check;
        let reason = "unused network";
        if (probe) {
            scope = "probe";
            check = "Orphaned probe networks";
        }
        else if (own.has(network.name)) {
            scope = "project";
            check = "Docker networks";
        }
        else if (context.machine && tdkNetworkOwner(network.name, prefixes)) {
            scope = "machine";
            check = "Docker networks";
            reason = `unused network of project "${tdkNetworkOwner(network.name, prefixes)}"`;
        }
        else {
            continue;
        }
        const action = {
            id: `remove-network:${network.name}`,
            check,
            scope,
            command: `docker network rm ${network.name}`,
            status: "planned",
            reason,
        };
        if (network.containers > 0) {
            action.status = "skipped";
            action.reason = `${network.containers} container(s) still attached`;
        }
        else if (scope === "project" && projectBusy) {
            // A starting stack creates its networks before any container joins them, so "unused" is not safe to remove.
            action.status = "skipped";
            action.reason = projectBusy;
        }
        else if (probe && deps.isProcessAlive(Number(probe[1]))) {
            // The doctor run that created it may still be using it.
            action.status = "skipped";
            action.reason = `probe of a running process (pid ${probe[1]})`;
        }
        actions.push(action);
    }
    return actions;
}
/** Run the planned actions in order. A declined or failed action never stops the rest, so a re-run converges. */
export async function applyDoctorFixes(actions, options, deps = dockerFixDeps) {
    const results = [];
    for (const action of actions) {
        if (action.status !== "planned" || options.dryRun) {
            results.push(action);
            continue;
        }
        if (!options.confirm) {
            results.push({
                ...action,
                status: "skipped",
                reason: "confirmation required; run in a terminal or pass --yes",
            });
            continue;
        }
        let confirmed = false;
        try {
            confirmed = await options.confirm(action);
        }
        catch {
            // No terminal to ask on.
        }
        if (!confirmed) {
            results.push({ ...action, status: "skipped", reason: "not confirmed" });
            continue;
        }
        try {
            if (action.id.startsWith("prune:")) {
                await deps.prune(action.id === "prune:builder" ? "builder" : "images");
                results.push({ ...action, status: "applied", reason: "pruned" });
                continue;
            }
            if (action.id.startsWith("stop-tilt:")) {
                deps.stopProcess(Number(action.id.slice("stop-tilt:".length)));
                results.push({ ...action, status: "applied", reason: "stopped" });
                continue;
            }
            await deps.removeNetwork(action.id.slice("remove-network:".length));
            results.push({ ...action, status: "applied", reason: "removed" });
        }
        catch (error) {
            results.push({ ...action, status: "failed", reason: firstLine(error) });
        }
    }
    return results;
}
/** Whether any action leaves a problem behind that a re-run could still repair. */
export function hasFailedActions(actions) {
    return actions.some((action) => action.status === "failed");
}
async function readTdkVersion(path) {
    try {
        const { stdout } = await execFilePromise(path, ["--version"], {
            encoding: "utf-8",
            timeout: 5000,
            windowsHide: true,
        });
        return stdout.trim().split(/\r?\n/)[0] || null;
    }
    catch {
        return null;
    }
}
/** Every distinct Flisk install on PATH (symlinks to one binary count once), in PATH order. */
export async function findTdkInstalls(paths = [...findAllOnPath(executableName()), ...findAllOnPath(legacyExecutableName())], readVersion = readTdkVersion) {
    const seen = new Set();
    const installs = [];
    for (const path of paths) {
        let real = path;
        try {
            real = realpathSync(path);
        }
        catch {
            // Keep the PATH entry as is.
        }
        if (seen.has(real))
            continue;
        seen.add(real);
        installs.push({ path, version: await readVersion(path) });
    }
    return installs;
}
/** Two `flisk` binaries can disagree (a dashboard or MCP client may launch the older one), so say which is which. */
export async function checkDuplicateTdkInstalls(installs) {
    const found = installs ?? (await findTdkInstalls());
    if (found.length <= 1) {
        return { name: "Flisk installs", didPass: true, message: "One flisk install on PATH" };
    }
    const list = found.map((i) => `${i.path} (${i.version ?? "version unknown"})`).join(", ");
    const versions = new Set(found.map((i) => i.version));
    return {
        name: "Flisk installs",
        didPass: false,
        isWarning: true,
        message: `${found.length} flisk installs on PATH${versions.size > 1 ? " with different versions" : ""}: ${list}`,
        fix: "Keep one: remove the others, or run flisk upgrade. The first on PATH is the one your shell runs; tools that launch /usr/local/bin/flisk directly may use another",
    };
}
/**
 * PIDs of `tilt up` processes for this project. The process list shows the Tiltfile path as it was typed at launch,
 * which may or may not be the symlink-resolved path, so both spellings are looked up.
 */
export function projectTiltPids(projectRoot, find = findProjectTiltUpPids) {
    const roots = new Set([projectRoot]);
    try {
        roots.add(realpathSync(projectRoot));
    }
    catch {
        // Keep the path as given.
    }
    const pids = new Set();
    for (const root of roots) {
        for (const pid of find(join(root, ".tdk", ".tdk-out", "Tiltfile")))
            pids.add(pid);
    }
    return [...pids];
}
