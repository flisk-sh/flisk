import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  getHostPortPlan
} from "./chunk-UR5FJV3G.js";
import {
  probeHostPort
} from "./chunk-IXI5AKZB.js";
import {
  openUrl
} from "./chunk-ZUHYZYUH.js";
import {
  databaseResourceNames,
  namesSharedPlatformPostgres
} from "./chunk-XT2XGGXK.js";
import {
  isDatabaseCapabilityEnabled
} from "./chunk-IZ7YHIUT.js";
import {
  discoverResourcesWithProblems,
  readProjectNameOrUndefined,
  resolveServicePath,
  resolveSubdomainBases,
  showDetail,
  showStep
} from "./chunk-KZQVEXPY.js";
import {
  DATABASE_MANAGEMENT_FEATURE,
  findProjectRoot,
  source_default
} from "./chunk-NKTINEF4.js";
import {
  toComposeProjectName
} from "./chunk-HS5H5D2L.js";

// dist/commands/open.js
import { Command } from "commander";

// dist/utils/shared-infra.js
function usesSharedPostgresAmong(resource, databaseNames) {
  const config = resource.config;
  if (!config)
    return false;
  if (Array.isArray(config.featuresEnabled) && config.featuresEnabled.includes(DATABASE_MANAGEMENT_FEATURE))
    return true;
  const dependsOn = Array.isArray(config.dependsOn) ? config.dependsOn : [];
  return dependsOn.some((name) => typeof name === "string" && namesSharedPlatformPostgres(name, databaseNames));
}
function groupSharedPostgres(projectName, stacks, options) {
  if (options && !isDatabaseCapabilityEnabled(options.projectRoot, { ...options }))
    return null;
  const prefix = toComposeProjectName(projectName);
  const databases = [];
  const databaseNames = databaseResourceNames(stacks.flatMap((stack) => stack.resources));
  for (const stack of [...stacks].sort((a, b) => a.name.localeCompare(b.name))) {
    const services = stack.resources.filter((resource) => usesSharedPostgresAmong(resource, databaseNames)).map((resource) => resource.name);
    if (services.length === 0)
      continue;
    databases.push({
      name: `${prefix}_${stack.name.replace(/-/g, "_")}`,
      stack: stack.name,
      services: services.sort()
    });
  }
  if (databases.length === 0)
    return null;
  return { name: "postgres", databases };
}
function readProjectName(projectRoot) {
  return readProjectNameOrUndefined(projectRoot) ?? null;
}

// dist/utils/spinner.js
var FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
function startSpinner(initialText) {
  const stream = process.stderr;
  const animate = stream.isTTY === true;
  let frame = 0;
  let text = initialText;
  let timer;
  const render = () => stream.write(`\r\x1B[2K${source_default.cyan(FRAMES[frame])} ${text}`);
  if (animate) {
    render();
    timer = setInterval(() => {
      frame = (frame + 1) % FRAMES.length;
      render();
    }, 80);
  } else {
    stream.write(`- ${text}
`);
  }
  const finish = (symbol, message) => {
    if (timer)
      clearInterval(timer);
    stream.write(`${animate ? "\r\x1B[2K" : ""}${symbol} ${message ?? text}
`);
  };
  return {
    get text() {
      return text;
    },
    set text(value) {
      text = value;
      if (!animate)
        stream.write(`- ${text}
`);
    },
    succeed: (message) => finish(source_default.green("\u2714"), message),
    fail: (message) => finish(source_default.red("\u2716"), message),
    warn: (message) => finish(source_default.yellow("\u26A0"), message)
  };
}

// dist/commands/open.js
async function listFrontendTargets(projectRoot) {
  const { resources } = discoverResourcesWithProblems(projectRoot);
  const plan = await getHostPortPlan(projectRoot, { inspectDocker: false });
  const { appBase } = resolveSubdomainBases(plan?.ingressHttp, projectRoot);
  return resources.filter((resource) => resource.config?.appType === "frontend").map((resource) => ({
    name: resource.name,
    url: `${appBase}${resolveServicePath(resource)}`
  }));
}
async function isFrontendReady(url, timeoutMs = 2e3) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return response.status < 500;
  } catch {
    return false;
  }
}
async function pickReadyFrontend(targets, waitMs = 3e4, onWait) {
  if (targets.length === 0)
    return void 0;
  const started = Date.now();
  while (true) {
    for (const target of targets) {
      if (await isFrontendReady(target.url))
        return target;
    }
    const elapsed = Date.now() - started;
    if (elapsed >= waitMs)
      return void 0;
    onWait?.(elapsed);
    await new Promise((resolve) => setTimeout(resolve, 2e3));
  }
}
async function findReadyFrontend(projectRoot, waitMs = 0, onWait) {
  const targets = await listFrontendTargets(projectRoot);
  return pickReadyFrontend(targets, waitMs, onWait);
}
async function openFirstFrontend(projectRootOverride) {
  const projectRoot = projectRootOverride ?? findProjectRoot();
  if (!projectRoot) {
    console.log(source_default.yellow("Not in a Flisk project, so there is no frontend to open."));
    console.log(source_default.gray("Run `flisk project --yes` first, or `flisk open` inside a project."));
    return null;
  }
  const targets = await listFrontendTargets(projectRoot);
  if (targets.length === 0) {
    console.log(source_default.yellow("This project has no frontend service to open."));
    console.log(source_default.gray("Start the stack with `flisk up` and add a frontend with `flisk resource`."));
    return null;
  }
  const projectName = readProjectName(projectRoot);
  showStep(`Opening the first frontend of ${projectName ?? "this project"}`);
  for (const target of targets) {
    console.log(source_default.gray(`  - ${target.name}: ${target.url}`));
  }
  const spinner = startSpinner("Waiting for the frontend to answer...");
  const first = await pickReadyFrontend(targets, 12e4, (elapsed) => {
    spinner.text = `Waiting for the frontend to answer... ${Math.round(elapsed / 1e3)}s`;
  });
  if (!first) {
    spinner.fail("No frontend answered yet.");
    const plan = await getHostPortPlan(projectRoot, { inspectDocker: false });
    const ingress = plan?.ingressHttp;
    const reachable = ingress ? await probeHostPort(ingress) === "in-use" : false;
    if (ingress && !reachable) {
      console.log(source_default.yellow(`The stack is running, but this machine cannot reach port ${ingress}.`));
      console.log(source_default.gray("  Docker is not publishing the port to the host."));
      const { checkColima } = await import("./colima-3WL5TDSY.js");
      const colima = checkColima();
      if (colima.isColima && !colima.running) {
        console.log(source_default.gray(`  ${colima.problem ?? "The Colima VM is not running"}`));
        console.log(source_default.gray(`  Fix: ${colima.fix ?? "colima start"}`));
      } else {
        console.log(source_default.gray("  Restart the Docker runtime (Docker Desktop or Colima), then run `flisk open` again."));
      }
    } else {
      console.log(source_default.yellow("The stack is not serving the frontend yet."));
      console.log(source_default.gray("  - Start the stack in another terminal: flisk up"));
      console.log(source_default.gray("  - Then run this again: flisk open"));
    }
    for (const target of targets) {
      console.log(source_default.gray(`  - ${target.name}: ${target.url}`));
    }
    return null;
  }
  spinner.succeed(`The frontend is up: ${first.name}`);
  const opened = await openUrl(first.url);
  console.log(opened ? source_default.green(`
Opened ${first.url}`) : source_default.yellow(`
Could not open a browser. Open ${first.url} yourself.`));
  showDetail("Run `flisk open` again to open the next frontend.");
  return first.url;
}
var openCommand = new Command("open").description("Open the first frontend of the project in your browser").action(async () => {
  await openFirstFrontend();
});

export {
  groupSharedPostgres,
  readProjectName,
  startSpinner,
  listFrontendTargets,
  isFrontendReady,
  pickReadyFrontend,
  findReadyFrontend,
  openFirstFrontend,
  openCommand
};
