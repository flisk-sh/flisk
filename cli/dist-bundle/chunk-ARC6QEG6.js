import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  JsonCommandError,
  runJsonCommand
} from "./chunk-FU6O43SU.js";
import {
  FliskError,
  findOnPath,
  findProjectRoot,
  runCommand,
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/commands/os.js
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Command } from "commander";
var FLISKOS_COMMAND = "fliskos";
var FLISKOS_PACKAGE = "@flisk-sh/fliskos";
var FLISKOS_REPOSITORY = "https://github.com/flisk-sh/fliskos";
var FLISKOS_APP = "FliskOS";
var READY_TIMEOUT_MS = 3e4;
var RUNNING_LINE = /FliskOS is running at (\S+)\r?\n/;
var MAX_SCANNED_OUTPUT = 4096;
function defaultHost() {
  return {
    platform: process.platform,
    home: homedir(),
    findCommand: findOnPath,
    exists: existsSync
  };
}
function appBundles(host) {
  return [
    `/Applications/${FLISKOS_APP}.app`,
    join(host.home, "Applications", `${FLISKOS_APP}.app`)
  ];
}
function locateFliskOs(host = defaultHost()) {
  const command = host.findCommand(FLISKOS_COMMAND);
  if (command)
    return { via: "command", path: command };
  if (host.platform !== "darwin")
    return null;
  const app = appBundles(host).find((bundle) => host.exists(bundle));
  return app ? { via: "app", path: app } : null;
}
function notInstalledError(platform = process.platform) {
  const isMac = platform === "darwin";
  const where = isMac ? `no \`${FLISKOS_COMMAND}\` command on PATH and no ${FLISKOS_APP}.app in /Applications or ~/Applications` : `no \`${FLISKOS_COMMAND}\` command on PATH`;
  return new JsonCommandError("FLISKOS_NOT_INSTALLED", `FliskOS is not installed (${where})`, [
    `Install the command once ${FLISKOS_PACKAGE} is published: npm install --global ${FLISKOS_PACKAGE}`,
    isMac ? `Or, from a checkout of ${FLISKOS_REPOSITORY}: npm run install:mac (installs ${FLISKOS_APP}.app)` : `Or build it from a checkout of ${FLISKOS_REPOSITORY}`,
    "Then run `flisk os` again. flisk never installs it for you."
  ]);
}
function parsePort(value) {
  const port = Number(value);
  if (!/^\d+$/.test(value.trim()) || port > 65535) {
    throw new FliskError(`--port must be an integer from 0 to 65535, got "${value}"`, [
      "Pass a port such as --port 4300, or leave it out and FliskOS picks a free one"
    ]);
  }
  return port;
}
function resolveOsProject(explicit, cwd) {
  if (explicit) {
    const path = resolve(cwd, explicit);
    const root = findProjectRoot(path);
    if (!root) {
      throw new FliskError(`No Flisk project at ${path} (no .flisk/project.json found)`, [
        "Pass the folder of a Flisk project: flisk os --project <path>",
        "Or leave --project out and FliskOS lists the projects it finds"
      ]);
    }
    return root;
  }
  return findProjectRoot(cwd);
}
function fliskOsArgs(input) {
  const args = [];
  if (input.project)
    args.push("--project", input.project);
  if (input.port !== void 0)
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
    `Reinstall it: npm install --global ${FLISKOS_PACKAGE}`
  ]);
}
function forwardSignals(child) {
  const pass = (signal) => () => {
    child.kill(signal);
  };
  const handlers = [
    ["SIGTERM", pass("SIGTERM")],
    ["SIGHUP", pass("SIGHUP")],
    ["SIGINT", process.stdin.isTTY ? () => {
    } : pass("SIGINT")]
  ];
  for (const [signal, handler] of handlers)
    process.on(signal, handler);
  return () => {
    for (const [signal, handler] of handlers)
      process.off(signal, handler);
  };
}
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
        reject(new JsonCommandError("FLISKOS_FAILED", `FliskOS did not say where it listens within ${Math.round(timeoutMs / 1e3)} seconds`, [`Run \`${FLISKOS_COMMAND}\` on its own to see what it prints`]));
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
      "If the port is taken, pass another one with --port"
    ], code || 1))), (error) => settle(() => reject(error)));
  });
}
function ignoredByApp(options, hasExplicitProject) {
  return [
    hasExplicitProject ? "--project" : "",
    options.port !== void 0 ? "--port" : "",
    options.open === false ? "--no-open" : "",
    (options.scanRoot ?? []).length > 0 ? "--scan-root" : ""
  ].filter(Boolean);
}
async function openApp(location, options, hasExplicitProject, deps) {
  const args = ["-a", FLISKOS_APP];
  const ignored = ignoredByApp(options, hasExplicitProject);
  console.log(source_default.gray(`Opening ${FLISKOS_APP}.app`));
  if (ignored.length > 0) {
    console.log(source_default.gray(`${FLISKOS_APP}.app does not take ${ignored.join(", ")}; install the \`${FLISKOS_COMMAND}\` command to use ${ignored.length === 1 ? "it" : "them"}.`));
  }
  const child = deps.spawn(deps.host.findCommand("open") ?? "open", args, {
    cwd: deps.cwd,
    stdio: ["ignore", "ignore", "inherit"]
  });
  const exit = await waitForExit(child);
  if (exit.error || exit.code !== 0) {
    throw new FliskError(exit.error ? `Could not run open: ${exit.error.message}` : `open could not start ${FLISKOS_APP}.app (exit code ${exit.code})`, [
      `Check that ${location.path} is a complete app: reinstall it with npm run install:mac in ${FLISKOS_REPOSITORY}`,
      `Or install the command instead: npm install --global ${FLISKOS_PACKAGE}`
    ]);
  }
  console.log(source_default.green(`Opened ${FLISKOS_APP}.app`));
  return {
    report: { via: "app", path: location.path, args, project: null, url: null, ignored },
    finished: Promise.resolve(0)
  };
}
async function launchFliskOs(options, overrides = {}) {
  const deps = {
    host: defaultHost(),
    spawn,
    cwd: process.cwd(),
    readyTimeoutMs: READY_TIMEOUT_MS,
    ...overrides
  };
  const port = options.port === void 0 ? void 0 : parsePort(options.port);
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
    scanRoots: (options.scanRoot ?? []).map((root) => resolve(deps.cwd, root))
  });
  const report = {
    via: "command",
    path: location.path,
    args,
    project,
    url: null,
    ignored: []
  };
  console.log(source_default.gray(`Starting FliskOS: ${[FLISKOS_COMMAND, ...args].join(" ")}`));
  const child = deps.spawn(location.path, args, {
    cwd: deps.cwd,
    stdio: options.json ? ["inherit", "pipe", "inherit"] : "inherit"
  });
  const restoreSignals = forwardSignals(child);
  const finished = waitForExit(child).then((exit) => {
    restoreSignals();
    if (exit.error)
      throw startError(location.path, exit.error);
    return exit.code;
  });
  finished.catch(() => {
  });
  if (!options.json)
    return { report, finished };
  const url = await waitForUrl(child, finished, deps.readyTimeoutMs);
  return { report: { ...report, url }, finished };
}
async function runOs(options, overrides = {}) {
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
  return [...previous ?? [], value];
}
var osCommand = new Command("os").description("Start FliskOS, the local desktop app for your Flisk projects, coding agents and Flisk apps").option("--project <dir>", "Open this Flisk project (default: the project around the current folder)").option("--port <port>", "Port FliskOS listens on (default: a free one)").option("--no-open", "Start the server without opening a window or browser").option("--scan-root <dir>", "Also look for Flisk projects under this folder (repeatable)", collect).option("--json", "Print one JSON envelope on stdout once FliskOS is up; FliskOS keeps running until it stops", false).addHelpText("after", `
Runs the \`${FLISKOS_COMMAND}\` command when it is on PATH, otherwise opens ${FLISKOS_APP}.app (macOS). Flisk never
installs it: ${FLISKOS_PACKAGE} (npm install --global ${FLISKOS_PACKAGE}) or ${FLISKOS_REPOSITORY}.
${FLISKOS_APP}.app takes none of the options. For a terminal dashboard of the running stack use \`flisk ui\`.
`).action(async (options, command) => {
  const project = options.project ?? command.optsWithGlobals().project;
  await runOs({ ...options, project });
});

export {
  FLISKOS_COMMAND,
  FLISKOS_PACKAGE,
  FLISKOS_REPOSITORY,
  FLISKOS_APP,
  READY_TIMEOUT_MS,
  defaultHost,
  appBundles,
  locateFliskOs,
  notInstalledError,
  parsePort,
  resolveOsProject,
  fliskOsArgs,
  launchFliskOs,
  runOs,
  osCommand
};
