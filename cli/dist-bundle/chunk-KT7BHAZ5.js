import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  startSpinner
} from "./chunk-NLPSJJBC.js";
import {
  readProjectName
} from "./chunk-LBE4PCHL.js";
import {
  openUrl
} from "./chunk-ZUHYZYUH.js";
import {
  probeHostPort
} from "./chunk-KHTVPPO5.js";
import {
  JsonCommandError,
  runJsonCommand
} from "./chunk-FU6O43SU.js";
import {
  getHostPortPlan
} from "./chunk-SYTFMWWH.js";
import {
  buildServicePorts
} from "./chunk-ZI7AIJRM.js";
import {
  discoverResourcesWithProblems,
  isNativeProject,
  resolveServicePath,
  resolveSubdomainBases
} from "./chunk-2BH5UW2N.js";
import {
  showDetail,
  showStep
} from "./chunk-ARPSTQFE.js";
import {
  FliskError,
  findProjectRoot,
  source_default,
  suggestClosest
} from "./chunk-73W4Y4TI.js";

// dist/commands/open.js
import { Command } from "commander";
async function listFrontendTargets(projectRoot) {
  const { resources } = discoverResourcesWithProblems(projectRoot);
  if (isNativeProject(resources)) {
    return resources.filter((resource) => resource.config?.appType === "frontend").flatMap((resource) => {
      const { directUrl } = buildServicePorts(resource, void 0, { native: true });
      return directUrl ? [{ name: resource.name, url: directUrl }] : [];
    });
  }
  const plan = await getHostPortPlan(projectRoot, { inspectDocker: false });
  const { appBase } = resolveSubdomainBases(plan?.ingressHttp, projectRoot);
  return resources.filter((resource) => resource.config?.appType === "frontend").map((resource) => ({
    name: resource.name,
    url: `${appBase}${resolveServicePath(resource)}`
  }));
}
function selectFrontends(targets, name) {
  return name === void 0 ? targets : targets.filter((target) => target.name === name);
}
function unknownFrontendSuggestions(name, targets) {
  const names = targets.map((target) => target.name);
  const closest = suggestClosest(name, names);
  return [
    ...closest ? [`Did you mean "${closest}"?`] : [],
    `Frontends: ${names.join(", ")}`,
    "Run `flisk resources` to list all resources"
  ];
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
async function openFirstFrontend(projectRootOverride, options = {}) {
  const report = options.isPrintOnly ? console.error : console.log;
  const projectRoot = projectRootOverride ?? findProjectRoot();
  if (!projectRoot) {
    report(source_default.yellow("Not in a Flisk project, so there is no frontend to open."));
    report(source_default.gray("Run `flisk project --yes` first, or `flisk open` inside a project."));
    return null;
  }
  const targets = await listFrontendTargets(projectRoot);
  if (targets.length === 0) {
    report(source_default.yellow("This project has no frontend service to open."));
    report(source_default.gray("Start the stack with `flisk up` and add a frontend with `flisk resource`."));
    return null;
  }
  const selected = selectFrontends(targets, options.resource);
  if (options.resource !== void 0 && selected.length === 0) {
    new FliskError(`Resource "${options.resource}" not found`, unknownFrontendSuggestions(options.resource, targets)).display();
    return null;
  }
  if (options.isPrintOnly) {
    const first2 = await pickReadyFrontend(selected, 12e4);
    if (!first2) {
      console.error("No frontend answered yet. Start the stack with `flisk up` and try again.");
      return null;
    }
    console.log(first2.url);
    return first2.url;
  }
  const projectName = readProjectName(projectRoot);
  showStep(options.resource === void 0 ? `Opening the first frontend of ${projectName ?? "this project"}` : `Opening ${options.resource} of ${projectName ?? "this project"}`);
  for (const target of selected) {
    console.log(source_default.gray(`  - ${target.name}: ${target.url}`));
  }
  const spinner = startSpinner("Waiting for the frontend to answer...");
  const first = await pickReadyFrontend(selected, 12e4, (elapsed) => {
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
      const { checkColima } = await import("./colima-C4AD6UXV.js");
      const colima = checkColima();
      if (colima.isColima && !colima.running) {
        console.log(source_default.gray(`  ${colima.problem ?? "The Colima VM is not running"}`));
        console.log(source_default.gray(`  Fix: ${colima.fix ?? "colima start"}`));
      } else {
        console.log(source_default.gray("  Restart the Docker runtime (Docker Desktop, Colima or Kiri), then run `flisk open` again."));
      }
    } else {
      console.log(source_default.yellow("The stack is not serving the frontend yet."));
      console.log(source_default.gray("  - Start the stack in another terminal: flisk up"));
      console.log(source_default.gray("  - Then run this again: flisk open"));
    }
    for (const target of selected) {
      console.log(source_default.gray(`  - ${target.name}: ${target.url}`));
    }
    return null;
  }
  spinner.succeed(`The frontend is up: ${first.name}`);
  const opened = await openUrl(first.url);
  console.log(opened ? source_default.green(`
Opened ${first.url}`) : source_default.yellow(`
Could not open a browser. Open ${first.url} yourself.`));
  showDetail("Run `flisk open <name>` to open another frontend.");
  return first.url;
}
var openCommand = new Command("open").description("Open the first ready frontend in your browser, or the frontend you name").argument("[resource]", "Frontend to open; defaults to the first ready one").option("--print", "Print the frontend URL without opening a browser").option("--json", "Print one JSON envelope on stdout; implies --print", false).addHelpText("after", "\nExamples:\n  flisk open\n  flisk open web2\n  flisk open --print\n  flisk open web2 --print\n  flisk open --print --json\n  flisk open --json").action(async (resource, options) => {
  if (options.json) {
    await runJsonCommand("OPEN_FAILED", "flisk open", async () => {
      const projectRoot = findProjectRoot();
      if (!projectRoot) {
        throw new JsonCommandError("NOT_IN_PROJECT", "Not in a Flisk project, so there is no frontend to open.", ["Run `flisk project --yes` first, or `flisk open` inside a project."]);
      }
      const targets = await listFrontendTargets(projectRoot);
      if (targets.length === 0) {
        throw new JsonCommandError("NO_FRONTEND", "This project has no frontend service to open.", ["Start the stack with `flisk up` and add a frontend with `flisk resource`."]);
      }
      const selected = selectFrontends(targets, resource);
      if (resource !== void 0 && selected.length === 0) {
        throw new JsonCommandError("UNKNOWN_FRONTEND", `Resource "${resource}" not found`, unknownFrontendSuggestions(resource, targets));
      }
      const first = await pickReadyFrontend(selected, 12e4);
      if (!first) {
        throw new JsonCommandError("FRONTEND_NOT_READY", "No frontend answered yet. Start the stack with `flisk up` and try again.", ["Start the stack with `flisk up` and try again."]);
      }
      return { data: { url: first.url, resource: first.name } };
    });
    return;
  }
  const url = await openFirstFrontend(void 0, {
    isPrintOnly: options.print,
    ...resource === void 0 ? {} : { resource }
  });
  if (url === null && (options.print || resource !== void 0))
    process.exitCode = 1;
});

export {
  listFrontendTargets,
  selectFrontends,
  unknownFrontendSuggestions,
  isFrontendReady,
  pickReadyFrontend,
  findReadyFrontend,
  openFirstFrontend,
  openCommand
};
