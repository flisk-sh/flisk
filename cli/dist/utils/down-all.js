// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { existsSync, readlinkSync } from "node:fs";
import { resolve } from "node:path";
import { findProjectTiltUpPids, isFliskComposeDir, processExecutable, readProcessTable, stopProjectComposeProjects, stopProjectTiltUp, waitForTiltUpExit, } from "./down-cleanup.js";
import { isNativeRunSupervisorAlive, readNativeRunState, stopNativeRun, } from "./native-runtime.js";
import { readProjectRecords } from "./project-registry.js";
import { extractProjectRootFromWorkingDir } from "./stale-projects.js";
const TILTFILE_SUFFIX = "/.flisk/.flisk-out/Tiltfile";
const dockerRunner = (command, args) => execFileSync(command, args, { encoding: "utf-8", stdio: "pipe", windowsHide: true });
const CONTAINER_FORMAT = [
    '{{.Label "com.docker.compose.project"}}',
    '{{.Label "com.docker.compose.project.working_dir"}}',
    '{{.Label "com.docker.compose.service"}}',
    "{{.Ports}}",
    "{{.Names}}",
    '{{.Label "sh.flisk.project"}}',
    '{{.Label "sh.flisk.project.dir"}}',
].join("\t");
/** The process's working folder, which is where `flisk up` wrote this native run's state. */
export function processWorkingFolder(pid, platform = process.platform, commandRunner = dockerRunner) {
    if (platform === "linux") {
        try {
            return readlinkSync(`/proc/${pid}/cwd`);
        }
        catch {
            return undefined;
        }
    }
    if (platform === "darwin") {
        try {
            const output = commandRunner("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
            return /^n(.+)$/m.exec(output)?.[1];
        }
        catch {
            return undefined;
        }
    }
    // Windows has no process table for this path; native runs there are found from their recorded folder instead.
    return undefined;
}
/** True for the `flisk up` supervisor, whether it was launched through a bin, node, bun or deno. */
export function isFliskUpCommand(command) {
    const exe = processExecutable(command);
    const rest = command.slice((command.split(/\s+/)[0] ?? "").length);
    const base = exe.replace(/\.(exe|cmd|bat)$/i, "");
    if (base === "flisk")
        return /(?:^|\s)up(?:\s|$)/.test(rest);
    if (/^(node|bun|deno)(\.exe)?$/i.test(base)) {
        const runsFliskCli = /(?:^|[\\/])flisk(?:[\\/]|\.(?:js|mjs|cjs|ts)|(?=\s|$))/i.test(rest);
        return runsFliskCli && /(?:^|\s)up(?:\s|$)/.test(rest);
    }
    return false;
}
/**
 * Tiltfile paths and Docker labels are POSIX paths even on Windows hosts, where `resolve()` would invent a drive letter.
 * Normalizing separators only keeps the folder reported by `--all` the same string `flisk up` recorded.
 */
function normalizeRoot(path) {
    return path.replace(/\\/g, "/").replace(/\/+$/, "");
}
/** Stack names `flisk up` passed to Tilt (`-- --focus=api web`). */
function stackNamesFromCommand(command) {
    const tail = command.split(/\s+--\s+/)[1];
    if (!tail)
        return [];
    return [
        ...new Set(tail
            .replace(/--(?:focus|only)=/g, "")
            .split(/\s+/)
            .filter((part) => part && !part.startsWith("--"))),
    ];
}
function parseContainerRow(line) {
    if (!line.trim())
        return undefined;
    const [composeProject, workingDir, service, portsField, name, fliskProject, fliskDir] = line.split("\t");
    if (!composeProject && !workingDir && !fliskProject)
        return undefined;
    const ports = new Set();
    for (const match of portsField?.matchAll(/:(\d+)->/g) ?? []) {
        const port = Number(match[1]);
        if (Number.isInteger(port) && port > 0)
            ports.add(port);
    }
    return {
        composeProject: (composeProject ?? "").trim(),
        workingDir: (workingDir ?? "").trim(),
        service: (service ?? "").trim(),
        ports: [...ports],
        name: (name ?? "").trim(),
        fliskProject: (fliskProject ?? "").trim(),
        fliskDir: (fliskDir ?? "").trim(),
    };
}
function addDetails(details, root, row) {
    let entry = details.get(root);
    if (!entry) {
        entry = { services: new Set(), ports: new Set(), composeProjects: new Set() };
        details.set(root, entry);
    }
    if (row.service || row.name)
        entry.services.add(row.service || row.name);
    for (const port of row.ports)
        entry.ports.add(port);
    if (row.composeProject)
        entry.composeProjects.add(row.composeProject);
}
/** True when a container belongs to Flisk, from its own labels or from the generated folder it was started from. */
function isFliskRow(root, row) {
    if (row.fliskProject || row.fliskDir)
        return true;
    const dir = row.fliskDir || row.workingDir;
    return Boolean(dir) && isFliskComposeDir(resolve(root), resolve(dir));
}
function dockerDetails(runner, tiltRoots, folderExists, records) {
    const details = new Map();
    let output;
    try {
        output = runner("docker", ["ps", "--format", CONTAINER_FORMAT]);
    }
    catch {
        return details; // Docker is not running: a native run can still be up.
    }
    const recordedRoots = new Set(records.flatMap((record) => record.roots).map(normalizeRoot));
    for (const line of output.split(/\r?\n/)) {
        const row = parseContainerRow(line);
        if (!row)
            continue;
        const dir = row.fliskDir || row.workingDir;
        if (!dir)
            continue;
        const root = normalizeRoot(extractProjectRootFromWorkingDir(dir));
        if (!isFliskRow(root, row))
            continue;
        // A deleted folder is only ours when its Tiltfile was seen in the process table or Flisk recorded the folder. Without
        // that, a hand-written Compose project with a missing folder must never be stopped by a global command.
        if (!tiltRoots.has(root) && !folderExists(root) && !recordedRoots.has(root))
            continue;
        addDetails(details, root, row);
    }
    return details;
}
function sorted(values) {
    return [...values].sort((a, b) => a.localeCompare(b));
}
/**
 * Every running Flisk stack on this machine, from the one `ps` reader in down-cleanup, each native run's own state and
 * the running containers' Compose labels. Nothing is stopped, written or generated here.
 */
export async function discoverRunningStacks(options = {}) {
    const platform = options.platform ?? process.platform;
    const runner = options.commandRunner ?? dockerRunner;
    const docker = options.docker ?? dockerRunner;
    const folderExists = options.folderExists ?? existsSync;
    const records = options.records ?? readProjectRecords();
    const cwdOf = options.cwdOf ?? ((pid) => processWorkingFolder(pid, platform, runner));
    const readNative = options.readNative ?? readNativeRunState;
    const nativeAlive = options.nativeAlive ?? isNativeRunSupervisorAlive;
    let processes = [];
    try {
        processes = readProcessTable(platform, runner);
    }
    catch {
        // A machine without `ps`: containers recorded by Flisk can still be listed.
    }
    const tilts = [];
    const tiltByRoot = new Map();
    for (const { pid, command } of processes) {
        if (processExecutable(command) !== "tilt" || !/^\S+\s+up\s/.test(command))
            continue;
        const tiltfile = / -f (\/.*?\/\.flisk\/\.flisk-out\/Tiltfile)(?= |$)/.exec(command)?.[1];
        if (!tiltfile)
            continue;
        const root = normalizeRoot(tiltfile.slice(0, -TILTFILE_SUFFIX.length));
        let tilt = tiltByRoot.get(root);
        if (!tilt) {
            tilt = { root, tiltfile, stacks: [], pids: [] };
            tiltByRoot.set(root, tilt);
            tilts.push(tilt);
        }
        tilt.pids.push(pid);
        for (const stack of stackNamesFromCommand(command)) {
            if (!tilt.stacks.includes(stack))
                tilt.stacks.push(stack);
        }
    }
    const containers = dockerDetails(docker, new Set(tiltByRoot.keys()), folderExists, records);
    const stacks = [];
    for (const tilt of tilts) {
        const detail = containers.get(tilt.root);
        stacks.push({
            folder: tilt.root,
            runtime: "docker",
            services: sorted(detail?.services ?? []),
            ports: [...(detail?.ports ?? [])].sort((a, b) => a - b),
            stacks: tilt.stacks,
            missingFolder: !folderExists(tilt.root),
            tiltfile: tilt.tiltfile,
            tiltPids: [...new Set(tilt.pids)].sort((a, b) => a - b),
            composeProjects: sorted(detail?.composeProjects ?? []),
        });
    }
    // A live native run is found from its own state: either beside a `flisk up` in the process table, or at a folder Flisk
    // recorded (a terminal can be closed, and Windows has no `ps` for this path). The pid/start-time check in nativeAlive
    // keeps an old run.json from ever making us signal a process Flisk did not start.
    const nativeCandidates = [];
    for (const { pid, command } of processes) {
        if (!isFliskUpCommand(command))
            continue;
        const folder = cwdOf(pid);
        if (folder)
            nativeCandidates.push({ root: normalizeRoot(folder), pid });
    }
    for (const record of records) {
        for (const root of record.roots)
            nativeCandidates.push({ root: normalizeRoot(root) });
    }
    const seenFolders = new Set([...tiltByRoot.keys(), ...stacks.map((stack) => stack.folder)]);
    for (const { root, pid } of nativeCandidates) {
        if (seenFolders.has(root))
            continue;
        const state = readNative(root);
        if (!state || (pid !== undefined && state.pid !== pid))
            continue;
        if (!(await nativeAlive(state)))
            continue;
        const services = Object.entries(state.services)
            .filter(([, service]) => !service.job)
            .map(([name]) => name);
        const ports = Object.values(state.services)
            .map((service) => service.port)
            .filter((port) => typeof port === "number");
        stacks.push({
            folder: root,
            runtime: "local",
            services: sorted(services),
            ports: [...new Set(ports)].sort((a, b) => a - b),
            stacks: [],
            missingFolder: !folderExists(root),
            tiltPids: [],
            composeProjects: [],
            supervisorPid: state.pid,
        });
        seenFolders.add(root);
    }
    // Containers whose Tilt is not visible (a stopped Tilt, a different user's ps) are still running Flisk projects.
    for (const [folder, detail] of containers) {
        if (stacks.some((stack) => stack.folder === folder))
            continue;
        stacks.push({
            folder,
            runtime: "docker",
            services: sorted(detail.services),
            ports: [...detail.ports].sort((a, b) => a - b),
            stacks: [],
            missingFolder: !folderExists(folder),
            tiltPids: [],
            composeProjects: sorted(detail.composeProjects),
        });
    }
    return stacks.sort((a, b) => a.folder.localeCompare(b.folder) || a.runtime.localeCompare(b.runtime));
}
/**
 * Stops one stack without loading its generated Tiltfile: kill only this Tilt's `tilt up`, then bring down only the Compose
 * projects whose containers carry this project's generated working folder. No generated file is read or rewritten.
 */
export async function stopRunningStack(stack, options = {}) {
    const platform = options.platform ?? process.platform;
    const runner = options.commandRunner ?? dockerRunner;
    const stopped = [];
    if (stack.runtime === "local") {
        const stopNative = options.stopNative ?? stopNativeRun;
        try {
            const result = await stopNative(stack.folder);
            for (const service of result.services)
                stopped.push(`local ${service}`);
            if (result.supervisorPid !== undefined)
                stopped.push(`flisk up (pid ${result.supervisorPid})`);
            return {
                ok: !result.unverified?.length,
                stopped,
                ...(result.stale ? { stale: true } : {}),
                ...(result.unverified?.length ? { unverified: result.unverified } : {}),
                ...(result.unverified?.length
                    ? {
                        error: "some processes on record could not be proven to be Flisk's and were left alone",
                    }
                    : {}),
            };
        }
        catch (err) {
            return { ok: false, stopped, error: err instanceof Error ? err.message : String(err) };
        }
    }
    if (stack.tiltfile && stack.tiltPids.length > 0) {
        const stopTilt = options.stopTilt ?? stopProjectTiltUp;
        try {
            const pids = stopTilt(stack.tiltfile, platform, runner);
            if (pids.length > 0)
                stopped.push(`tilt up (pid ${pids.join(", ")})`);
            const waitForTilt = options.waitForTilt ??
                ((tiltfile) => waitForTiltUpExit(tiltfile, 8000, (path) => findProjectTiltUpPids(path, platform, runner)));
            await waitForTilt(stack.tiltfile);
        }
        catch (err) {
            return { ok: false, stopped, error: err instanceof Error ? err.message : String(err) };
        }
    }
    const stopCompose = options.stopCompose ?? stopProjectComposeProjects;
    try {
        const result = stopCompose(stack.folder, runner);
        for (const name of result.stopped)
            stopped.push(`compose ${name}`);
        if (result.failed.length > 0) {
            return {
                ok: false,
                stopped,
                error: result.failed.map((failed) => `${failed.name}: ${failed.reason}`).join("; "),
            };
        }
    }
    catch (err) {
        return { ok: false, stopped, error: err instanceof Error ? err.message : String(err) };
    }
    return { ok: true, stopped };
}
