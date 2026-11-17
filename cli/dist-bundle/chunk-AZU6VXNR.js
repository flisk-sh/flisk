import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  checkPortStatus
} from "./chunk-BH74SJOW.js";
import {
  readProjectConfig
} from "./chunk-RYTYYP36.js";
import {
  createHostPortPlan,
  readSavedHostPortPlan
} from "./chunk-SYTFMWWH.js";
import {
  createDiscoveryContext
} from "./chunk-4EDXFYDP.js";
import {
  attachNoPositionalHint
} from "./chunk-MJGDAK6E.js";
import {
  createMachineEnvelope,
  writeMachineError
} from "./chunk-3SNMUNQF.js";
import {
  isRoutableService,
  isWebUiBringYourOwn,
  resolveServicePath,
  resolveServiceUrl,
  stackExists
} from "./chunk-2BH5UW2N.js";
import {
  isValidPort,
  sanitizeForShell
} from "./chunk-UPCGXTMS.js";
import {
  DEFAULT_BOX_WIDTH,
  colorizeByStatus,
  formatBoxLine,
  formatPadded,
  getStatusIcon,
  printBoxedHeader
} from "./chunk-ARPSTQFE.js";
import {
  errorFactories,
  findOnPath,
  findProjectRoot,
  getStackEmoji,
  logVerbose,
  requireProjectRoot,
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/commands/networks.js
import { execFileSync, spawn } from "node:child_process";
import { Command } from "commander";
function execSafe(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(findOnPath(command) ?? command, args, {
      timeout: options.timeout || 5e3,
      shell: false,
      windowsHide: process.platform === "win32"
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });
    child.on("error", (err) => {
      reject(err);
    });
  });
}
function determineDefaultDomain() {
  const projectRoot = findProjectRoot();
  if (projectRoot) {
    const projectConfig = readProjectConfig(projectRoot);
    const projectName = projectConfig.project?.name;
    if (projectName && projectName !== "flisk-project") {
      return `${projectName}.localhost`;
    }
  }
  const domains = /* @__PURE__ */ new Set();
  try {
    const traefikLabels = execFileSync(findOnPath("docker") ?? "docker", ["ps", "--filter", "label=traefik.enable=true", "--format", "{{.Labels}}"], { encoding: "utf-8", windowsHide: process.platform === "win32" });
    const domainRegex = /Host\(`([a-zA-Z0-9_.-]{1,100})`\)/g;
    for (let match = domainRegex.exec(traefikLabels); match !== null; match = domainRegex.exec(traefikLabels)) {
      if (match[1])
        domains.add(match[1]);
    }
  } catch (err) {
    console.warn(source_default.yellow("\u26A0\uFE0F Could not scan Traefik domains (Docker unavailable)"));
    logVerbose("Docker scan error details", err);
  }
  const domainList = Array.from(domains);
  const projectDomains = domainList.filter((domain) => {
    if (/^(app|api)\.[\w-]+\.localhost$/.test(domain))
      return true;
    const servicePatterns = [
      /\w+-\w+-frontend\.localhost$/,
      /\w+-\w+-backend\.localhost$/,
      /\w+-\w+-worker\.localhost$/,
      /\w+-\w+-migrator\.localhost$/
    ];
    return !servicePatterns.some((pattern) => pattern.test(domain));
  });
  const isGatewayHost = (domain) => /^(app|api)\.[\w-]+\.localhost$/.test(domain);
  if (projectDomains.some(isGatewayHost)) {
    for (let i = projectDomains.length - 1; i >= 0; i--) {
      const domain = projectDomains[i];
      if (!isGatewayHost(domain) && domain.split(".").length > 2)
        projectDomains.splice(i, 1);
    }
  }
  if (projectDomains.length > 0) {
    projectDomains.sort((a, b) => a.length - b.length);
    const firstProjectDomain = projectDomains[0];
    if (firstProjectDomain)
      return firstProjectDomain;
  }
  if (domainList.length > 0) {
    const firstDomain = domainList[0];
    if (firstDomain) {
      const localhostMatch = firstDomain.match(/([\w-]+)\.localhost$/);
      if (localhostMatch) {
        const commonProjects = ["flisk", "project", "app", "api", "myapp"];
        for (const project of commonProjects) {
          const testDomain = `${project}.localhost`;
          if (domainList.includes(testDomain)) {
            return testDomain;
          }
        }
      }
    }
  }
  return "localhost";
}
async function checkServiceStatus(serviceName, port, url) {
  if (url) {
    try {
      const validUrl = new URL(url);
      if (validUrl.protocol !== "http:" && validUrl.protocol !== "https:") {
        return "stopped";
      }
      const statusCode = await execSafe("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "2", validUrl.toString()], { timeout: 3e3 });
      const code = statusCode.trim();
      if (/^[23]\d\d$/.test(code) || code === "401" || code === "403") {
        return "running";
      }
      if (/^[45]\d\d$/.test(code)) {
        return "stopped";
      }
      if (code === "000") {
        return "stopped";
      }
    } catch (err) {
      console.warn(source_default.yellow(`\u26A0\uFE0F Could not reach ${url} (HTTP check failed)`));
      logVerbose(`HTTP check error details for ${url}`, err);
      return "stopped";
    }
  }
  if (port && isValidPort(port)) {
    const portStatus = await checkPortStatus(port);
    if (portStatus === "running") {
      return "running";
    }
    if (portStatus === "unknown") {
      console.warn(source_default.yellow(process.platform === "win32" ? `\u26A0\uFE0F Could not check port ${port} with the Windows TCP probe` : `\u26A0\uFE0F Could not check port ${port} (port probe unavailable)`));
    }
  }
  try {
    const containerName = sanitizeForShell(serviceName);
    const result = await execSafe("docker", ["ps", "--filter", `name=${containerName}`, "--format", "{{.Names}}"], { timeout: 5e3 });
    if (result && result.trim().length > 0) {
      return "running";
    }
  } catch (err) {
    console.warn(source_default.yellow(`\u26A0\uFE0F Could not check Docker for ${serviceName}`));
    logVerbose(`Docker check error details for ${serviceName}`, err);
  }
  return "stopped";
}
var networksCommand = attachNoPositionalHint(new Command("networks")).description("Show Traefik-routed URLs for all services").alias("urls").alias("traefik").option("-s, --stack <stack>", "Filter by stack name").option("--json", "Output a versioned JSON response").option("--json-legacy", "Output the legacy JSON array (deprecated)").option("--raw", "Output raw URLs only").action(async (options) => {
  const action = async () => {
    const projectRoot = options.json || options.jsonLegacy ? findProjectRoot() : requireProjectRoot();
    if (!projectRoot) {
      throw errorFactories.notInProject();
    }
    const discovery = createDiscoveryContext();
    if (options.stack && !stackExists(options.stack, discovery.resources)) {
      const error = errorFactories.stackNotFound(options.stack, discovery.stackNames);
      if (options.json || options.jsonLegacy)
        throw error;
      error.exit();
    }
    const savedPlan = readSavedHostPortPlan(projectRoot);
    const hostPortPlan = savedPlan ?? await createHostPortPlan();
    const httpPort = hostPortPlan.ingressHttp;
    const baseDomain = process.env.FLISK_SERVICE_BASE_URL ? void 0 : determineDefaultDomain();
    const services = discovery.resources;
    const servicesWithUrls = await Promise.all(services.filter(isRoutableService).map(async (s) => {
      const url = resolveServiceUrl(s, httpPort, baseDomain) ?? "";
      const resolvedPath = resolveServicePath(s);
      const basePath = resolvedPath.startsWith("/") ? resolvedPath : `/${resolvedPath}`;
      const port = s.config?.port;
      const status = await checkServiceStatus(s.name, port, url);
      return {
        name: s.name,
        stack: s.stack,
        basePath,
        url,
        // A web UI is routed by Host header, so an IP URL would never reach its router.
        ...process.platform === "win32" && !isWebUiBringYourOwn(s) ? { loopbackUrl: `http://127.0.0.1:${httpPort}${basePath}`.replace(/\/$/, "") } : {},
        port,
        status
      };
    }));
    const filteredServices = options.stack ? servicesWithUrls.filter((s) => s.stack === options.stack) : servicesWithUrls;
    if (options.json || options.jsonLegacy) {
      console.log(options.jsonLegacy ? JSON.stringify(filteredServices, null, 2) : JSON.stringify(createMachineEnvelope({ services: filteredServices })));
      return;
    }
    if (filteredServices.length === 0) {
      if (options.stack) {
        console.log(source_default.yellow(`\u26A0\uFE0F No routable services found in stack "${options.stack}"`));
      } else {
        console.log(source_default.yellow("\u26A0\uFE0F No routable services found"));
      }
      process.exit(0);
    }
    if (options.raw) {
      for (const service of filteredServices) {
        console.log(service.url);
        if (service.loopbackUrl)
          console.log(service.loopbackUrl);
      }
      process.exit(0);
    }
    printBoxedHeader("\u{1F310}  TRAEFIK NETWORKS", baseDomain ? `Domain: http://${baseDomain}:${httpPort}` : `Base URL: ${process.env.FLISK_SERVICE_BASE_URL}`, DEFAULT_BOX_WIDTH);
    const stacks = /* @__PURE__ */ new Map();
    for (const stackName of discovery.stackNames) {
      const stackServices = filteredServices.filter((s) => s.stack === stackName);
      if (stackServices.length > 0) {
        stacks.set(stackName, stackServices);
      }
    }
    const unstackedServices = filteredServices.filter((s) => !s.stack);
    if (unstackedServices.length > 0) {
      stacks.set("default", unstackedServices);
    }
    let isFirstStack = true;
    for (const [stackName, stackServices] of stacks) {
      if (!isFirstStack) {
        console.log();
      }
      isFirstStack = false;
      const emoji = getStackEmoji(stackName);
      const stackTitle = `${emoji}  ${stackName.toUpperCase()} STACK`;
      console.log();
      console.log(source_default.bold.white(stackTitle));
      console.log(source_default.gray(formatBoxLine("\u2501", DEFAULT_BOX_WIDTH - 4)));
      for (const service of stackServices) {
        const statusSymbol = getStatusIcon(service.status);
        const statusEmoji = colorizeByStatus(statusSymbol, service.status);
        const namePart = formatPadded(service.name, 22);
        const urlPart = service.status === "running" ? source_default.cyan.underline(service.url) : source_default.gray(service.url);
        const statusLabel = service.status !== "running" ? source_default.gray(` [${service.status}]`) : "";
        console.log(`  ${statusEmoji} ${source_default.white(namePart)}  ${urlPart}${statusLabel}`);
        if (service.loopbackUrl) {
          console.log(`     ${source_default.gray(`Loopback: ${service.loopbackUrl} (Host: ${new URL(service.url).hostname})`)}`);
        }
      }
    }
    console.log();
    console.log(source_default.gray(formatBoxLine("\u2500", DEFAULT_BOX_WIDTH - 2)));
    console.log(source_default.gray("\u{1F5B1}\uFE0F  Click any URL above to open in browser"));
    console.log(source_default.gray("\u{1F4CA} Status: ") + source_default.green("\u2713 Running") + " | " + source_default.red("\u2717 Stopped") + " | " + source_default.gray("? Unknown"));
    if (baseDomain === "localhost") {
      console.log();
      const projectConfig = readProjectConfig(projectRoot);
      const projectName = projectConfig.project.name;
      console.log(source_default.yellow("\u{1F4A1} Tip: Set custom domain with:"));
      console.log(source_default.cyan(`   export FLISK_PUBLIC_HOST=${projectName}.localhost`));
    }
    console.log();
  };
  if (options.json || options.jsonLegacy) {
    try {
      await action();
    } catch (error) {
      writeMachineError(error);
    }
    return;
  }
  await action();
});

export {
  determineDefaultDomain,
  checkServiceStatus,
  networksCommand
};
