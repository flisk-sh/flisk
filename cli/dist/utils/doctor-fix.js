// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { findProjectTiltUpPids, projectNetworkNames } from "./down-cleanup.js";
import { findAllOnPath } from "./which.js";
const execFilePromise = promisify(execFile);
const DOCKER_TIMEOUT_MS = 15_000;
/** The networks `tdk doctor` creates to test capacity; an interrupted run leaves one behind. */
const PROBE_NETWORK = /^tdk_doctor_probe_(\d+)$/;
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
export function createDockerFixDeps(run = runDocker) {
    return {
        async listNetworks() {
            const names = (await run(["network", "ls", "--format", "{{.Name}}"]))
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean);
            // One inspect per network: another process (a doctor probe, `tdk down`) can remove one mid-listing, and a
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
 * What `--fix` would do. Only unused networks that are either a leftover doctor probe or one of this project's own
 * (the exact names the engine creates, and only while `projectBusy` is unset) are planned; another project's networks are never listed here.
 */
export async function planDoctorFixes(projectName, deps = dockerFixDeps, projectBusy) {
    const networks = await deps.listNetworks();
    const actions = [];
    const own = new Set(projectName ? projectNetworkNames(projectName) : []);
    for (const network of networks) {
        const probe = PROBE_NETWORK.exec(network.name);
        let scope;
        let check;
        if (probe) {
            scope = "probe";
            check = "Orphaned probe networks";
        }
        else if (own.has(network.name)) {
            scope = "project";
            check = "Docker networks";
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
            reason: "unused network",
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
        const name = action.id.slice("remove-network:".length);
        try {
            await deps.removeNetwork(name);
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
/** Every distinct `tdk` on PATH (symlinks to one binary count once), in PATH order. */
export async function findTdkInstalls(paths = findAllOnPath("tdk"), readVersion = readTdkVersion) {
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
/** Two `tdk` binaries can disagree (a dashboard or MCP client may launch the older one), so say which is which. */
export async function checkDuplicateTdkInstalls(installs) {
    const found = installs ?? (await findTdkInstalls());
    if (found.length <= 1) {
        return { name: "TDK installs", didPass: true, message: "One tdk install on PATH" };
    }
    const list = found.map((i) => `${i.path} (${i.version ?? "version unknown"})`).join(", ");
    const versions = new Set(found.map((i) => i.version));
    return {
        name: "TDK installs",
        didPass: false,
        isWarning: true,
        message: `${found.length} tdk installs on PATH${versions.size > 1 ? " with different versions" : ""}: ${list}`,
        fix: "Keep one: remove the others, or run tdk upgrade. The first on PATH is the one your shell runs; tools that launch /usr/local/bin/tdk directly may use another",
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
