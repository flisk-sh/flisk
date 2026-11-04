// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * `flisk os`: starts FliskOS, the local desktop app for Flisk projects, coding agents and Flisk apps.
 *
 * FliskOS lives in its own repository and ships on its own, so this command only finds it and starts it: the
 * `fliskos` command when it is on PATH, otherwise FliskOS.app on macOS. It never installs anything; when neither
 * exists it says how to install it. `flisk ui` is the separate terminal dashboard and is not touched.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { FliskError, runCommand } from "../utils/errors.js";
import { JsonCommandError, runJsonCommand } from "../utils/json-command.js";
import { findProjectRoot } from "../utils/paths.js";
import { findOnPath } from "../utils/which.js";
/** The command the FliskOS package installs. */
export const FLISKOS_COMMAND = "fliskos";
/** The npm package that installs it (not published yet). */
export const FLISKOS_PACKAGE = "@flisk-sh/fliskos";
/** The repository FliskOS is built from. */
export const FLISKOS_REPOSITORY = "https://github.com/flisk-sh/fliskos";
/** The name of the macOS app, which is what `open -a` takes. */
export const FLISKOS_APP = "FliskOS";
/** How long `--json` waits for FliskOS to say where it listens before it gives up. */
export const READY_TIMEOUT_MS = 30_000;
/** The line `fliskos` prints once its server listens. It must be complete: a chunk can end inside the URL. */
const RUNNING_LINE = /FliskOS is running at (\S+)\r?\n/;
/** The longest stretch of FliskOS output kept while `--json` looks for the line above. */
const MAX_SCANNED_OUTPUT = 4096;
export function defaultHost() {
    return {
        platform: process.platform,
        home: homedir(),
        findCommand: findOnPath,
        exists: existsSync,
    };
}
/** The places `install:mac` puts the app: the system folder when it was writable, else the user's. */
export function appBundles(host) {
    return [
        `/Applications/${FLISKOS_APP}.app`,
        join(host.home, "Applications", `${FLISKOS_APP}.app`),
    ];
}
/**
 * Finds FliskOS: the `fliskos` command wins, because it takes the project and the other options; the macOS app is the
 * fallback. Returns null when neither is there.
 */
export function locateFliskOs(host = defaultHost()) {
    const command = host.findCommand(FLISKOS_COMMAND);
    if (command)
        return { via: "command", path: command };
    if (host.platform !== "darwin")
        return null;
    const app = appBundles(host).find((bundle) => host.exists(bundle));
    return app ? { via: "app", path: app } : null;
}
/** The error for a machine with neither the command nor the app. Nothing is installed on the user's behalf. */
export function notInstalledError(platform = process.platform) {
    const isMac = platform === "darwin";
    const where = isMac
        ? `no \`${FLISKOS_COMMAND}\` command on PATH and no ${FLISKOS_APP}.app in /Applications or ~/Applications`
        : `no \`${FLISKOS_COMMAND}\` command on PATH`;
    return new JsonCommandError("FLISKOS_NOT_INSTALLED", `FliskOS is not installed (${where})`, [
        `Install the command once ${FLISKOS_PACKAGE} is published: npm install --global ${FLISKOS_PACKAGE}`,
        isMac
            ? `Or, from a checkout of ${FLISKOS_REPOSITORY}: npm run install:mac (installs ${FLISKOS_APP}.app)`
            : `Or build it from a checkout of ${FLISKOS_REPOSITORY}`,
        "Then run `flisk os` again. flisk never installs it for you.",
    ]);
}
/** Reads `--port` the way `fliskos` does: an integer from 0 (a free port) to 65535. */
export function parsePort(value) {
    const port = Number(value);
    if (!/^\d+$/.test(value.trim()) || port > 65535) {
        throw new FliskError(`--port must be an integer from 0 to 65535, got "${value}"`, [
            "Pass a port such as --port 4300, or leave it out and FliskOS picks a free one",
        ]);
    }
    return port;
}
/**
 * The project to open: the one at `--project` (an error when it is not a Flisk project), else the one around the
 * current folder, else none, and FliskOS finds the projects itself.
 */
export function resolveOsProject(explicit, cwd) {
    if (explicit) {
        const path = resolve(cwd, explicit);
        const root = findProjectRoot(path);
        if (!root) {
            throw new FliskError(`No Flisk project at ${path} (no .flisk/project.json found)`, [
                "Pass the folder of a Flisk project: flisk os --project <path>",
                "Or leave --project out and FliskOS lists the projects it finds",
            ]);
        }
        return root;
    }
    return findProjectRoot(cwd);
}
/** The arguments `fliskos` takes, in the order they are documented. */
export function fliskOsArgs(input) {
    const args = [];
    if (input.project)
        args.push("--project", input.project);
    if (input.port !== undefined)
        args.push("--port", String(input.port));
    if (input.open === false)
        args.push("--no-open");
    for (const root of input.scanRoots ?? [])
        args.push("--scan-root", root);
    return args;
}
function waitForExit(child) {
    return new Promise((resolveExit) => {
        child.once("error", (error) => resolveExit({ code: 127, error }));
        child.once("close", (code) => resolveExit({ code: code ?? 1 }));
    });
}
function startError(path, error) {
    return new FliskError(`Could not start ${path}: ${error.message}`, [
        `Check that it is executable: ls -l ${path}`,
        `Reinstall it: npm install --global ${FLISKOS_PACKAGE}`,
    ]);
}
/**
 * Keeps `flisk os` alive until FliskOS is done. A terminal sends Ctrl+C to FliskOS itself, so there this process only
 * has to outlive it; a signal sent to this process alone is passed on, or FliskOS would keep running and hold its
 * port. Returns the function that puts the signals back.
 */
function forwardSignals(child) {
    const pass = (signal) => () => {
        child.kill(signal);
    };
    const handlers = [
        ["SIGTERM", pass("SIGTERM")],
        ["SIGHUP", pass("SIGHUP")],
        ["SIGINT", process.stdin.isTTY ? () => { } : pass("SIGINT")],
    ];
    for (const [signal, handler] of handlers)
        process.on(signal, handler);
    return () => {
        for (const [signal, handler] of handlers)
            process.off(signal, handler);
    };
}
/**
 * Resolves with the URL `fliskos` prints once it listens, copying everything it prints to stderr so stdout stays free
 * for the envelope. Rejects when it exits first or says nothing within the timeout.
 */
function waitForUrl(child, finished, timeoutMs) {
    return new Promise((resolveUrl, reject) => {
        let output = "";
        let isSettled = false;
        const settle = (action) => {
            if (isSettled)
                return;
            isSettled = true;
            clearTimeout(timer);
            action();
        };
        const timer = setTimeout(() => {
            settle(() => {
                child.kill();
                reject(new JsonCommandError("FLISKOS_FAILED", `FliskOS did not say where it listens within ${Math.round(timeoutMs / 1000)} seconds`, [`Run \`${FLISKOS_COMMAND}\` on its own to see what it prints`]));
            });
        }, timeoutMs);
        child.stdout?.on("data", (chunk) => {
            process.stderr.write(chunk);
            if (isSettled)
                return;
            output = (output + chunk.toString()).slice(-MAX_SCANNED_OUTPUT);
            const match = RUNNING_LINE.exec(output);
            if (match?.[1])
                settle(() => resolveUrl(match[1]));
        });
        finished.then((code) => settle(() => reject(new JsonCommandError("FLISKOS_FAILED", `${FLISKOS_COMMAND} exited with code ${code} before it started listening`, [
            `Run \`${FLISKOS_COMMAND}\` on its own to see why`,
            "If the port is taken, pass another one with --port",
        ], code || 1))), (error) => settle(() => reject(error)));
    });
}
/** The options the app cannot take: it opens its own window and finds projects itself. */
function ignoredByApp(options, hasExplicitProject) {
    return [
        hasExplicitProject ? "--project" : "",
        options.port !== undefined ? "--port" : "",
        options.open === false ? "--no-open" : "",
        (options.scanRoot ?? []).length > 0 ? "--scan-root" : "",
    ].filter(Boolean);
}
async function openApp(location, options, hasExplicitProject, deps) {
    const args = ["-a", FLISKOS_APP];
    const ignored = ignoredByApp(options, hasExplicitProject);
    console.log(chalk.gray(`Opening ${FLISKOS_APP}.app`));
    if (ignored.length > 0) {
        console.log(chalk.gray(`${FLISKOS_APP}.app does not take ${ignored.join(", ")}; install the \`${FLISKOS_COMMAND}\` command to use ${ignored.length === 1 ? "it" : "them"}.`));
    }
    const child = deps.spawn(deps.host.findCommand("open") ?? "open", args, {
        cwd: deps.cwd,
        stdio: ["ignore", "ignore", "inherit"],
    });
    const exit = await waitForExit(child);
    if (exit.error || exit.code !== 0) {
        throw new FliskError(exit.error
            ? `Could not run open: ${exit.error.message}`
            : `open could not start ${FLISKOS_APP}.app (exit code ${exit.code})`, [
            `Check that ${location.path} is a complete app: reinstall it with npm run install:mac in ${FLISKOS_REPOSITORY}`,
            `Or install the command instead: npm install --global ${FLISKOS_PACKAGE}`,
        ]);
    }
    console.log(chalk.green(`Opened ${FLISKOS_APP}.app`));
    return {
        report: { via: "app", path: location.path, args, project: null, url: null, ignored },
        finished: Promise.resolve(0),
    };
}
/**
 * Finds FliskOS and starts it. The command runs in the foreground with the caller's terminal, and `finished` resolves
 * with its exit code. With `--json` the command's output is piped so the URL can be read from it: this resolves once
 * FliskOS listens (so the envelope can go out), and `finished` still resolves when it stops. The app opens and returns.
 */
export async function launchFliskOs(options, overrides = {}) {
    const deps = {
        host: defaultHost(),
        spawn,
        cwd: process.cwd(),
        readyTimeoutMs: READY_TIMEOUT_MS,
        ...overrides,
    };
    const port = options.port === undefined ? undefined : parsePort(options.port);
    const project = resolveOsProject(options.project, deps.cwd);
    const location = locateFliskOs(deps.host);
    if (!location)
        throw notInstalledError(deps.host.platform);
    if (location.via === "app")
        return openApp(location, options, Boolean(options.project), deps);
    const args = fliskOsArgs({
        project,
        port,
        open: options.open,
        scanRoots: (options.scanRoot ?? []).map((root) => resolve(deps.cwd, root)),
    });
    const report = {
        via: "command",
        path: location.path,
        args,
        project,
        url: null,
        ignored: [],
    };
    console.log(chalk.gray(`Starting FliskOS: ${[FLISKOS_COMMAND, ...args].join(" ")}`));
    const child = deps.spawn(location.path, args, {
        cwd: deps.cwd,
        stdio: options.json ? ["inherit", "pipe", "inherit"] : "inherit",
    });
    const restoreSignals = forwardSignals(child);
    const finished = waitForExit(child).then((exit) => {
        restoreSignals();
        if (exit.error)
            throw startError(location.path, exit.error);
        return exit.code;
    });
    // A start failure is reported by whoever awaits `finished`; this keeps it from being unhandled in the meantime.
    finished.catch(() => { });
    if (!options.json)
        return { report, finished };
    const url = await waitForUrl(child, finished, deps.readyTimeoutMs);
    return { report: { ...report, url }, finished };
}
/**
 * Runs `flisk os`: starts FliskOS and waits for it, setting the exit code to its own. With `--json` one envelope goes
 * to stdout as soon as FliskOS is up, and the command keeps running until FliskOS stops.
 */
export async function runOs(options, overrides = {}) {
    if (options.json) {
        const state = {};
        await runJsonCommand("FLISKOS_FAILED", "flisk os", async () => {
            const launch = await launchFliskOs(options, overrides);
            state.finished = launch.finished;
            return { data: launch.report };
        });
        if (state.finished)
            process.exitCode = await state.finished;
        return;
    }
    await runCommand(async () => {
        const launch = await launchFliskOs(options, overrides);
        process.exitCode = await launch.finished;
    });
}
function collect(value, previous) {
    return [...(previous ?? []), value];
}
export const osCommand = new Command("os")
    .description("Start FliskOS, the local desktop app for your Flisk projects, coding agents and Flisk apps")
    .option("--project <dir>", "Open this Flisk project (default: the project around the current folder)")
    .option("--port <port>", "Port FliskOS listens on (default: a free one)")
    .option("--no-open", "Start the server without opening a window or browser")
    .option("--scan-root <dir>", "Also look for Flisk projects under this folder (repeatable)", collect)
    .option("--json", "Print one JSON envelope on stdout once FliskOS is up; FliskOS keeps running until it stops", false)
    .addHelpText("after", `
Runs the \`${FLISKOS_COMMAND}\` command when it is on PATH, otherwise opens ${FLISKOS_APP}.app (macOS). Flisk never
installs it: ${FLISKOS_PACKAGE} (npm install --global ${FLISKOS_PACKAGE}) or ${FLISKOS_REPOSITORY}.
${FLISKOS_APP}.app takes none of the options. For a terminal dashboard of the running stack use \`flisk ui\`.
`)
    .action(async (options, command) => {
    // The root program also defines `--project` (the one-command template flow), and Commander gives a root option to
    // the root wherever it appears, so `flisk os --project <dir>` arrives in the global options.
    const project = options.project ?? command.optsWithGlobals().project;
    await runOs({ ...options, project });
});
