// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile, spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import chalk from "chalk";
import { loadTemplate } from "../generator/template-engine.js";
import { createDemoStage, type DemoPhase, type DemoPhaseStatus } from "./demo-stage.js";
import { FliskError } from "./errors.js";
import { isPortListening, isProcessAlive, readNativeRunState } from "./native-runtime.js";
import { parseStackEnvelope, type StackOutcome } from "./one-command.js";
import { openUrl } from "./url-actions.js";
import { findOnPath } from "./which.js";

/**
 * `flisk demo` without Docker: when Docker or Tilt is not ready (or on native Windows, or with `--no-docker`), the demo writes a
 * small two-service app (a menu API and a website) from the CLI package's templates and starts it as local processes. It needs
 * only Node, no git clone, no Bun and no network, so the first command a new user runs ends in a working page.
 */

/** The demo folder under ~/.flisk, next to the Docker demo's flisk-demo. */
export const NATIVE_DEMO_DIR = "flisk-demo-native";
/** Forces the demo without Docker even when Docker and Tilt are ready. Not in the help: the demo picks it by itself. */
export const NO_DOCKER_FLAG = "--no-docker";
/** Written into the demo folder, so a rerun knows the folder is the demo's and may rewrite its files. */
const MARKER = join(".flisk", "demo-native.json");
const TEMPLATE_FILES = ["api/server.mjs", "web/server.mjs", "web/index.html"] as const;
const DEFAULT_PORTS = { api: 4000, web: 3000 } as const;

export interface DemoPorts {
  api: number;
  web: number;
}

/** What the container check runs, injectable so the decision is testable without Docker. */
export interface ContainerProbe {
  onPath(command: string): string | null;
  succeeds(command: string, args: string[]): Promise<boolean>;
}

const defaultProbe: ContainerProbe = {
  onPath: findOnPath,
  succeeds: (command, args) =>
    new Promise((resolve) => {
      execFile(command, args, { timeout: 10_000, windowsHide: true }, (error) => resolve(!error));
    }),
};

/** Why the Docker + Tilt demo cannot run here, or null when Docker is running and Compose and Tilt are installed. */
export async function containerDemoProblem(
  probe: ContainerProbe = defaultProbe,
): Promise<string | null> {
  if (!probe.onPath("docker")) return "Docker is not installed";
  if (!(await probe.succeeds("docker", ["info"]))) return "Docker is not running";
  if (!(await probe.succeeds("docker", ["compose", "version"]))) {
    return "the Docker Compose plugin is not installed";
  }
  if (!probe.onPath("tilt")) return "Tilt is not installed";
  return null;
}

/**
 * Why `flisk demo` runs without Docker, or null for the full Docker + Tilt demo. The flag and the platform are decided before
 * Docker is probed, so `--no-docker` and native Windows never wait on `docker info`.
 */
export async function nativeDemoReason(input: {
  argv: readonly string[];
  platform: string;
  env: NodeJS.ProcessEnv;
  probe?: ContainerProbe;
}): Promise<string | null> {
  if (input.argv.includes(NO_DOCKER_FLAG)) return `${NO_DOCKER_FLAG} was passed`;
  if (input.platform === "win32" && input.env.FLISK_ALLOW_NATIVE_WINDOWS !== "1") {
    return "the full demo on Windows runs in WSL2";
  }
  return containerDemoProblem(input.probe);
}

/** The first port from `start` that nothing listens on. */
export async function findFreePort(
  start: number,
  isTaken: (port: number) => Promise<boolean> = isPortListening,
  exclude: readonly number[] = [],
  attempts = 100,
): Promise<number> {
  for (let port = start; port < start + attempts; port += 1) {
    if (!exclude.includes(port) && !(await isTaken(port))) return port;
  }
  throw new FliskError(`No free port between ${start} and ${start + attempts - 1}`, [
    "Stop a program that listens on one of these ports, then run flisk demo again",
  ]);
}

/** Free ports for the two services, starting from 4000 for the API and 3000 for the website. */
export async function pickDemoPorts(
  isTaken: (port: number) => Promise<boolean> = isPortListening,
): Promise<DemoPorts> {
  const api = await findFreePort(DEFAULT_PORTS.api, isTaken);
  const web = await findFreePort(DEFAULT_PORTS.web, isTaken, [api]);
  return { api, web };
}

/** The service.json of each service, keyed by its path in the demo folder. */
export function nativeDemoManifests(ports: DemoPorts): Record<string, Record<string, unknown>> {
  return {
    "api/service.json": {
      schemaVersion: 1,
      appName: "api",
      appType: "backend",
      command: "node server.mjs",
      port: ports.api,
      healthCheckPath: "/health",
    },
    "web/service.json": {
      schemaVersion: 1,
      appName: "web",
      appType: "frontend",
      command: "node server.mjs",
      port: ports.web,
      healthCheckPath: "/health",
      env: { API_URL: `http://localhost:${ports.api}` },
      dependsOn: ["api"],
    },
  };
}

/** True when `dir` is a folder this demo wrote. */
export function isNativeDemoFolder(dir: string): boolean {
  return existsSync(join(dir, MARKER));
}

/** True when `dir` may receive the demo: it is missing, empty, or a demo folder from an earlier run. */
export function canWriteNativeDemo(dir: string): boolean {
  if (!existsSync(dir)) return true;
  return isNativeDemoFolder(dir) || readdirSync(dir).length === 0;
}

/** Writes the app and its service.json files. A rerun rewrites them, so the ports follow what is free now. */
export function writeNativeDemo(
  dir: string,
  ports: DemoPorts,
  readTemplate: (name: string) => string = loadTemplate,
): void {
  const files: Record<string, string> = {};
  for (const name of TEMPLATE_FILES) files[name] = readTemplate(`demo-native/${name}`);
  for (const [name, manifest] of Object.entries(nativeDemoManifests(ports))) {
    files[name] = `${JSON.stringify(manifest, null, 2)}\n`;
  }
  files[MARKER] = `${JSON.stringify({ demo: "native", ports }, null, 2)}\n`;
  for (const [name, contents] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
}

/** The website URL of a demo that is still running in `dir`, or null. */
export function runningNativeDemoUrl(dir: string): string | null {
  const state = readNativeRunState(dir);
  if (!state || !isProcessAlive(state.pid)) return null;
  const web = state.services.web;
  if (web?.url) return web.url;
  return web?.port ? `http://localhost:${web.port}` : null;
}

/**
 * Starts `flisk up --json` in the demo folder as a detached process whose output goes to `logPath`, and resolves with the
 * envelope it prints once both services answer. The process supervises the services after this command exits, until
 * `flisk down`.
 */
export function startNativeDemo(
  binPath: string,
  dir: string,
  logPath: string,
  options: { timeoutMs?: number; spawnFn?: typeof spawn; pollMs?: number } = {},
): Promise<StackOutcome> {
  const { timeoutMs = 90_000, spawnFn = spawn, pollMs = 250 } = options;
  mkdirSync(dirname(logPath), { recursive: true });
  const fd = openSync(logPath, "w");
  const child = spawnFn(process.execPath, [binPath, "up", "--json"], {
    cwd: dir,
    detached: true,
    stdio: ["ignore", fd, fd],
    windowsHide: true,
  });
  closeSync(fd);
  child.unref?.();
  const read = () => (existsSync(logPath) ? readFileSync(logPath, "utf-8") : "");

  return new Promise((resolve) => {
    let exited: number | null | undefined;
    child.on("exit", (code) => {
      exited = code;
    });
    child.on("error", (error) => {
      exited = -1;
      settle({ ok: false, error: error.message, raw: read() });
    });
    const startedAt = Date.now();
    let timer: NodeJS.Timeout | undefined;
    let settled = false;
    function settle(outcome: StackOutcome): void {
      if (settled) return;
      settled = true;
      if (timer) clearInterval(timer);
      resolve(outcome);
    }
    timer = setInterval(() => {
      const output = read();
      const envelope = parseStackEnvelope(output);
      if (envelope) {
        settle(envelope);
      } else if (exited !== undefined) {
        settle({
          ok: false,
          error: `flisk up stopped before the demo was ready (code ${exited})`,
          raw: output,
        });
      } else if (Date.now() - startedAt > timeoutMs) {
        settle({ ok: false, error: "the demo services did not answer in time", raw: output });
      }
    }, pollMs);
  });
}

export interface NativeDemoInput {
  destination: string;
  binPath: string;
  /** Why the demo runs without Docker, printed before it starts. */
  reason: string;
  version: string;
  open?: (url: string) => Promise<boolean>;
}

/** The whole demo without Docker. Returns the exit code. */
export async function runNativeDemo(input: NativeDemoInput): Promise<number> {
  const { destination, binPath } = input;
  const open = input.open ?? ((url: string) => openUrl(url));

  console.log(chalk.gray(`📁 Demo folder: ${destination}`));
  const running = runningNativeDemoUrl(destination);
  if (running) {
    console.log(chalk.gray(`The demo is already running: ${running}`));
    await open(running);
    return 0;
  }
  if (!canWriteNativeDemo(destination)) {
    console.log(chalk.yellow(`${destination} already exists and is not a Flisk demo folder.`));
    console.log(chalk.gray("  Remove it, or use --project <dir> to put the demo somewhere else."));
    return 1;
  }
  console.log(
    chalk.gray(
      `Running the small demo as local processes (${input.reason}). With Docker running and Tilt installed, flisk demo starts the full restaurant demo.`,
    ),
  );

  let phases: DemoPhase[] = [
    { id: "write", label: "Writing the demo app", status: "active" },
    { id: "start", label: "Starting services (no Docker)", status: "pending" },
  ];
  const stage = createDemoStage({
    title: "Flisk demo",
    subtitle: "without Docker",
    phases,
    servicesReady: 0,
    servicesTotal: 2,
    servicesBuilding: 0,
    elapsedMs: 0,
  });
  const setPhase = (id: string, status: DemoPhaseStatus, elapsedMs?: number): void => {
    phases = phases.map((phase) =>
      phase.id === id ? { ...phase, status, elapsedMs: elapsedMs ?? phase.elapsedMs } : phase,
    );
    stage.update({ phases });
  };
  const logPath = join(destination, ".flisk", "demo-native.log");

  const writeStarted = Date.now();
  let ports: DemoPorts;
  try {
    ports = await pickDemoPorts();
    writeNativeDemo(destination, ports);
  } catch (error) {
    stage.fail(
      error instanceof Error ? error.message : String(error),
      "Free a port between 3000 and 4100, or use --project <dir> in a folder you can write to.",
    );
    stage.stop();
    return 1;
  }
  setPhase("write", "done", Date.now() - writeStarted);

  const startStarted = Date.now();
  setPhase("start", "active");
  const outcome = await startNativeDemo(binPath, destination, logPath);
  if (!outcome.ok) {
    stage.fail(
      outcome.error ?? "The demo services did not start.",
      `Run \`flisk up\` in ${destination} to see what they printed.`,
      logPath,
    );
    stage.stop();
    return 1;
  }
  setPhase("start", "done", Date.now() - startStarted);
  stage.update({ servicesReady: 2 });

  const webUrl = `http://localhost:${ports.web}`;
  await open(webUrl);
  stage.finish({
    urls: [webUrl, `http://localhost:${ports.api}/api/menu`],
    summary: "2 app services · local processes · no Docker",
    hint: `Stop it with \`flisk down\` in ${destination}.`,
    version: input.version,
  });
  stage.stop();
  return 0;
}
