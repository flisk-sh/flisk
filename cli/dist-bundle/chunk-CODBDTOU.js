import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  openUrl
} from "./chunk-ZUHYZYUH.js";
import {
  isPortListening,
  isProcessAlive,
  readNativeRunState
} from "./chunk-TAU7KIR2.js";
import {
  loadTemplate
} from "./chunk-EBAHXK67.js";
import {
  createDemoStage
} from "./chunk-ZJU3CRIG.js";
import {
  FliskError,
  findOnPath,
  source_default
} from "./chunk-NKTINEF4.js";
import {
  parseStackEnvelope
} from "./chunk-A5E6ZETB.js";

// dist/utils/native-demo.js
import { execFile, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
var NATIVE_DEMO_DIR = "flisk-demo-native";
var NO_DOCKER_FLAG = "--no-docker";
var MARKER = join(".flisk", "demo-native.json");
var TEMPLATE_FILES = ["api/server.mjs", "web/server.mjs", "web/index.html"];
var DEFAULT_PORTS = { api: 4e3, web: 3e3 };
var defaultProbe = {
  onPath: findOnPath,
  succeeds: (command, args) => new Promise((resolve) => {
    execFile(command, args, { timeout: 1e4, windowsHide: true }, (error) => resolve(!error));
  })
};
async function containerDemoProblem(probe = defaultProbe) {
  if (!probe.onPath("docker"))
    return "Docker is not installed";
  if (!await probe.succeeds("docker", ["info"]))
    return "Docker is not running";
  if (!await probe.succeeds("docker", ["compose", "version"])) {
    return "the Docker Compose plugin is not installed";
  }
  if (!probe.onPath("tilt"))
    return "Tilt is not installed";
  return null;
}
async function nativeDemoReason(input) {
  if (input.argv.includes(NO_DOCKER_FLAG))
    return `${NO_DOCKER_FLAG} was passed`;
  if (input.platform === "win32" && input.env.FLISK_ALLOW_NATIVE_WINDOWS !== "1") {
    return "the full demo on Windows runs in WSL2";
  }
  return containerDemoProblem(input.probe);
}
async function findFreePort(start, isTaken = isPortListening, exclude = [], attempts = 100) {
  for (let port = start; port < start + attempts; port += 1) {
    if (!exclude.includes(port) && !await isTaken(port))
      return port;
  }
  throw new FliskError(`No free port between ${start} and ${start + attempts - 1}`, [
    "Stop a program that listens on one of these ports, then run flisk demo again"
  ]);
}
async function pickDemoPorts(isTaken = isPortListening) {
  const api = await findFreePort(DEFAULT_PORTS.api, isTaken);
  const web = await findFreePort(DEFAULT_PORTS.web, isTaken, [api]);
  return { api, web };
}
function nativeDemoManifests(ports) {
  return {
    "api/service.json": {
      schemaVersion: 1,
      appName: "api",
      appType: "backend",
      command: "node server.mjs",
      port: ports.api,
      healthCheckPath: "/health"
    },
    "web/service.json": {
      schemaVersion: 1,
      appName: "web",
      appType: "frontend",
      command: "node server.mjs",
      port: ports.web,
      healthCheckPath: "/health",
      env: { API_URL: `http://localhost:${ports.api}` },
      dependsOn: ["api"]
    }
  };
}
function isNativeDemoFolder(dir) {
  return existsSync(join(dir, MARKER));
}
function canWriteNativeDemo(dir) {
  if (!existsSync(dir))
    return true;
  return isNativeDemoFolder(dir) || readdirSync(dir).length === 0;
}
function writeNativeDemo(dir, ports, readTemplate = loadTemplate) {
  const files = {};
  for (const name of TEMPLATE_FILES)
    files[name] = readTemplate(`demo-native/${name}`);
  for (const [name, manifest] of Object.entries(nativeDemoManifests(ports))) {
    files[name] = `${JSON.stringify(manifest, null, 2)}
`;
  }
  files[MARKER] = `${JSON.stringify({ demo: "native", ports }, null, 2)}
`;
  for (const [name, contents] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
}
function runningNativeDemoUrl(dir) {
  const state = readNativeRunState(dir);
  if (!state || !isProcessAlive(state.pid))
    return null;
  const web = state.services.web;
  if (web?.url)
    return web.url;
  return web?.port ? `http://localhost:${web.port}` : null;
}
function startNativeDemo(binPath, dir, logPath, options = {}) {
  const { timeoutMs = 9e4, spawnFn = spawn, pollMs = 250 } = options;
  mkdirSync(dirname(logPath), { recursive: true });
  const fd = openSync(logPath, "w");
  const child = spawnFn(process.execPath, [binPath, "up", "--json"], {
    cwd: dir,
    detached: true,
    stdio: ["ignore", fd, fd],
    windowsHide: true
  });
  closeSync(fd);
  child.unref?.();
  const read = () => existsSync(logPath) ? readFileSync(logPath, "utf-8") : "";
  return new Promise((resolve) => {
    let exited;
    child.on("exit", (code) => {
      exited = code;
    });
    child.on("error", (error) => {
      exited = -1;
      settle({ ok: false, error: error.message, raw: read() });
    });
    const startedAt = Date.now();
    let timer;
    let settled = false;
    function settle(outcome) {
      if (settled)
        return;
      settled = true;
      if (timer)
        clearInterval(timer);
      resolve(outcome);
    }
    timer = setInterval(() => {
      const output = read();
      const envelope = parseStackEnvelope(output);
      if (envelope) {
        settle(envelope);
      } else if (exited !== void 0) {
        settle({
          ok: false,
          error: `flisk up stopped before the demo was ready (code ${exited})`,
          raw: output
        });
      } else if (Date.now() - startedAt > timeoutMs) {
        settle({ ok: false, error: "the demo services did not answer in time", raw: output });
      }
    }, pollMs);
  });
}
async function runNativeDemo(input) {
  const { destination, binPath } = input;
  const open = input.open ?? ((url) => openUrl(url));
  console.log(source_default.gray(`\u{1F4C1} Demo folder: ${destination}`));
  const running = runningNativeDemoUrl(destination);
  if (running) {
    console.log(source_default.gray(`The demo is already running: ${running}`));
    await open(running);
    return 0;
  }
  if (!canWriteNativeDemo(destination)) {
    console.log(source_default.yellow(`${destination} already exists and is not a Flisk demo folder.`));
    console.log(source_default.gray("  Remove it, or use --project <dir> to put the demo somewhere else."));
    return 1;
  }
  console.log(source_default.gray(`Running the small demo as local processes (${input.reason}). With Docker running and Tilt installed, flisk demo starts the full restaurant demo.`));
  let phases = [
    { id: "write", label: "Writing the demo app", status: "active" },
    { id: "start", label: "Starting services (no Docker)", status: "pending" }
  ];
  const stage = createDemoStage({
    title: "Flisk demo",
    subtitle: "without Docker",
    phases,
    servicesReady: 0,
    servicesTotal: 2,
    servicesBuilding: 0,
    elapsedMs: 0
  });
  const setPhase = (id, status, elapsedMs) => {
    phases = phases.map((phase) => phase.id === id ? { ...phase, status, elapsedMs: elapsedMs ?? phase.elapsedMs } : phase);
    stage.update({ phases });
  };
  const logPath = join(destination, ".flisk", "demo-native.log");
  const writeStarted = Date.now();
  let ports;
  try {
    ports = await pickDemoPorts();
    writeNativeDemo(destination, ports);
  } catch (error) {
    stage.fail(error instanceof Error ? error.message : String(error), "Free a port between 3000 and 4100, or use --project <dir> in a folder you can write to.");
    stage.stop();
    return 1;
  }
  setPhase("write", "done", Date.now() - writeStarted);
  const startStarted = Date.now();
  setPhase("start", "active");
  const outcome = await startNativeDemo(binPath, destination, logPath);
  if (!outcome.ok) {
    stage.fail(outcome.error ?? "The demo services did not start.", `Run \`flisk up\` in ${destination} to see what they printed.`, logPath);
    stage.stop();
    return 1;
  }
  setPhase("start", "done", Date.now() - startStarted);
  stage.update({ servicesReady: 2 });
  const webUrl = `http://localhost:${ports.web}`;
  await open(webUrl);
  stage.finish({
    urls: [webUrl, `http://localhost:${ports.api}/api/menu`],
    summary: "2 app services \xB7 local processes \xB7 no Docker",
    hint: `Stop it with \`flisk down\` in ${destination}.`,
    version: input.version
  });
  stage.stop();
  return 0;
}

export {
  NATIVE_DEMO_DIR,
  NO_DOCKER_FLAG,
  containerDemoProblem,
  nativeDemoReason,
  findFreePort,
  pickDemoPorts,
  nativeDemoManifests,
  isNativeDemoFolder,
  canWriteNativeDemo,
  writeNativeDemo,
  runningNativeDemoUrl,
  startNativeDemo,
  runNativeDemo
};
