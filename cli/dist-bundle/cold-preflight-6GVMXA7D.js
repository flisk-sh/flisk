import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  readyNextStep
} from "./chunk-UJEJFGPG.js";
import {
  DOCTOR_FIXES,
  MIN_BUN_VERSION,
  checkDockerCompose,
  checkDockerRuntime,
  checkDockerVersions,
  checkTilt,
  projectNeedsBun,
  versionMeetsMinimum
} from "./chunk-J6UU26BV.js";
import "./chunk-DCOXNGQQ.js";
import "./chunk-MP4WL74Z.js";
import "./chunk-AQDZHQMD.js";
import "./chunk-RD63MOSC.js";
import "./chunk-KHTVPPO5.js";
import "./chunk-4UXITHOF.js";
import "./chunk-R6ECUM4N.js";
import "./chunk-5L7YRPQH.js";
import "./chunk-3P4YMCKC.js";
import "./chunk-X45DIH6R.js";
import "./chunk-OKFJRRFZ.js";
import "./chunk-4L23R74S.js";
import {
  checkColima
} from "./chunk-QRGFABNE.js";
import "./chunk-QQ2PAYEU.js";
import "./chunk-OOCPRNQ4.js";
import "./chunk-3SLZPPGL.js";
import "./chunk-RYTYYP36.js";
import "./chunk-QNRIMYTK.js";
import "./chunk-NRF42HAR.js";
import "./chunk-2PSIPSDY.js";
import {
  describeHostPortPlan,
  getHostPortPlan,
  hostPortPlanFix
} from "./chunk-SYTFMWWH.js";
import "./chunk-ZI7AIJRM.js";
import "./chunk-KT6PYS2C.js";
import {
  checkNatsBroker
} from "./chunk-TZFR2MQ6.js";
import "./chunk-LJHNJFBB.js";
import {
  isDatabaseCapabilityEnabled,
  isGatewayEnabled
} from "./chunk-BH5IJ6AV.js";
import {
  toComposeProjectName
} from "./chunk-HS5H5D2L.js";
import "./chunk-2ZNKJUYM.js";
import "./chunk-3SNMUNQF.js";
import "./chunk-3EZ4UDYT.js";
import {
  discoverResourcesFromRoot,
  isNativeProject
} from "./chunk-2BH5UW2N.js";
import "./chunk-U3566SRZ.js";
import "./chunk-UPCGXTMS.js";
import "./chunk-ARPSTQFE.js";
import {
  PROJECT_JSON,
  findOnPath,
  findProjectRoot
} from "./chunk-73W4Y4TI.js";
import "./chunk-VVP2Y2AJ.js";

// dist/utils/cold-preflight.js
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// dist/utils/bun-floor.js
function bunMeetsFloor(version) {
  return versionMeetsMinimum(version, MIN_BUN_VERSION);
}
var BUN_FLOOR_LABEL = `${MIN_BUN_VERSION[0]}.${MIN_BUN_VERSION[1]}+`;

// dist/utils/cold-preflight.js
var NATIVE_CHECK_IDS = ["node", "bun"];
function blockingCheckIds(scope) {
  if (scope === "scaffold")
    return SCAFFOLD_CHECK_IDS;
  if (scope === "native")
    return NATIVE_CHECK_IDS;
  return MACHINE_CHECK_IDS;
}
var RUNTIME_CHECK_IDS = ["docker", "compose", "tilt"];
var SCAFFOLD_CHECK_IDS = ["node", "bun", "ports"];
var MACHINE_CHECK_IDS = [
  "node",
  ...RUNTIME_CHECK_IDS,
  "bun",
  "ports"
];
function item(id, result) {
  return {
    id,
    ok: result.didPass || Boolean(result.isSkipped),
    message: result.message,
    fix: result.fix
  };
}
function nodeTooOld(version) {
  const [major = 0, minor = 0] = String(version).split(".").map((part) => Number.parseInt(part, 10));
  return !Number.isFinite(major) || !Number.isFinite(minor) || major < 22 || major === 22 && minor < 12;
}
async function safeCheck(id, check, fallback) {
  try {
    return item(id, await check());
  } catch {
    return { id, ok: false, message: fallback };
  }
}
function requireVerifiedDockerVersions(result) {
  if (!result.isSkipped)
    return result;
  return {
    ...result,
    didPass: false,
    isSkipped: false,
    message: `Could not verify Docker Engine/Compose minimum versions: ${result.message}`,
    fix: result.fix ?? "Start Docker and ensure Docker Engine 25+ and Compose 2.20.2+ are installed."
  };
}
function usesPrisma(projectRoot) {
  try {
    return discoverResourcesFromRoot(projectRoot).some((resource) => {
      return resource.config?.featuresEnabled?.includes("prisma") ?? false;
    });
  } catch {
    return false;
  }
}
async function hostPortsItem(root, scope, opts) {
  const caps = {
    gateway: isGatewayEnabled(root, opts),
    database: isDatabaseCapabilityEnabled(root, opts)
  };
  try {
    const plan = await getHostPortPlan(root, {
      ...scope === "scaffold" ? { inspectDocker: false } : {},
      database: caps.database,
      gateway: caps.gateway
    });
    return {
      id: "ports",
      ok: true,
      message: describeHostPortPlan(plan, caps)
    };
  } catch (error) {
    return {
      id: "ports",
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      fix: hostPortPlanFix(caps)
    };
  }
}
async function runColdPreflight(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const projectRoot = findProjectRoot(cwd);
  const inProject = Boolean(projectRoot);
  const resources = projectRoot ? discoverResourcesFromRoot(projectRoot) : [];
  const isNative = isNativeProject(resources);
  const scope = isNative ? "native" : opts.scope ?? "runtime";
  const items = [];
  const nodeVersion = process.versions.node;
  items.push({
    id: "node",
    ok: !nodeTooOld(nodeVersion),
    message: nodeVersion,
    fix: nodeTooOld(nodeVersion) ? `Install Node.js 22.12+ (current: ${nodeVersion}). https://nodejs.org` : void 0
  });
  if (scope === "runtime") {
    const colima = checkColima();
    if (colima.isColima) {
      items.push({
        id: "colima",
        ok: colima.running,
        message: colima.running ? `Colima VM is running${colima.arch ? ` (${colima.arch})` : ""}` : colima.problem ?? "The Colima VM is not running",
        fix: colima.running ? void 0 : colima.fix
      });
    }
    items.push(await safeCheck("docker", checkDockerRuntime, "Docker daemon is not running"));
    items.push(await safeCheck("compose", async () => {
      const [compose, versions] = await Promise.all([
        checkDockerCompose(),
        checkDockerVersions()
      ]);
      if (!compose.didPass)
        return compose;
      return requireVerifiedDockerVersions(versions);
    }, "Docker Engine or Compose version check failed"));
    items.push(await safeCheck("tilt", checkTilt, "Tilt CLI not found"));
  }
  const bunNeeded = projectRoot ? projectNeedsBun(resources) : true;
  let bun = false;
  const bunPath = bunNeeded ? findOnPath("bun") : void 0;
  if (bunPath) {
    try {
      const version = execFileSync(bunPath, ["--version"], {
        encoding: "utf-8",
        timeout: 1e4
      }).trim();
      bun = bunMeetsFloor(version);
    } catch {
    }
  }
  items.push(bunNeeded ? {
    id: "bun",
    ok: bun,
    message: bun ? `Bun ${BUN_FLOOR_LABEL} is available on PATH` : `Bun ${BUN_FLOOR_LABEL} not found on PATH`,
    fix: bun ? void 0 : "curl -fsSL https://bun.sh/install | bash"
  } : { id: "bun", ok: true, message: "Bun not needed: no generated JS services" });
  if (scope !== "native")
    items.push(await hostPortsItem(projectRoot ?? cwd, scope, opts));
  if (projectRoot && scope === "runtime") {
    const nats = await safeCheck("nats", () => checkNatsBroker(projectRoot), "NATS broker check failed");
    if (!nats.ok)
      items.push(nats);
    if (isDatabaseCapabilityEnabled(projectRoot, opts) && usesPrisma(projectRoot)) {
      let dbUp = false;
      try {
        const config = JSON.parse(readFileSync(join(projectRoot, ".flisk", PROJECT_JSON), "utf-8"));
        const projectName = toComposeProjectName(String(config?.project?.name ?? "")).toLowerCase();
        if (projectName) {
          const running = execFileSync(findOnPath("docker") ?? "docker", [
            "ps",
            "--filter",
            `label=com.docker.compose.project=${projectName}`,
            "--filter",
            "label=com.docker.compose.service=postgres",
            "--filter",
            "health=healthy",
            "--format",
            "{{.Names}}"
          ], { encoding: "utf-8", timeout: 3e3 }).trim();
          dbUp = running.length > 0;
        }
      } catch {
      }
      if (!dbUp)
        items.push({
          id: "prisma",
          ok: false,
          message: "A Prisma resource is configured, but the project Postgres service is not healthy",
          fix: "Run `flisk up` to start the bundled Postgres, then check `flisk doctor`."
        });
    }
  }
  const failures = items.filter((check) => !check.ok).slice(0, 8);
  const blockingIds = blockingCheckIds(scope);
  const machineFailed = failures.some((check) => blockingIds.includes(check.id));
  const bunFailed = failures.some((check) => check.id === "bun");
  let header = "";
  if (failures.length > 0) {
    if (!machineFailed) {
      header = "Machine is ready. Project wiring is not.";
    } else if (scope === "native") {
      header = "Cannot start the local processes. Fix the machine checks below.";
    } else if (scope === "scaffold") {
      header = bunFailed ? `Project setup blocked. Bun ${BUN_FLOOR_LABEL} must be installed on PATH.
Fix the machine checks below.` : "Project setup blocked. Fix the machine checks below.";
    } else {
      header = bunFailed ? `Cold start blocked. Bun ${BUN_FLOOR_LABEL} must be installed on PATH.
Prisma/NATS configuration is project-specific and generated after \`flisk project\`. Fix the machine checks below.` : "Cold start blocked. Bun/Prisma/NATS are not the first failure.\nThey are generated after `flisk project`. Fix the machine checks below.";
    }
  }
  let footer = "";
  if (failures.length === 0) {
    footer = inProject ? "Environment ready for Flisk" : `This machine is ready for Flisk.
${readyNextStep()}`;
  }
  return { ok: failures.length === 0, inProject, scope, items: failures, header, footer };
}
function formatColdPreflight(result, options = {}) {
  const lines = [result.header];
  for (const check of result.items) {
    lines.push(`FAIL ${check.id.padEnd(7)} ${check.message}`);
    if (check.fix)
      lines.push(`  ${check.fix}`);
  }
  if (result.footer && (options.includeSuccessFooter ?? true))
    lines.push(result.footer);
  return lines.filter(Boolean).join("\n");
}
async function assertMachineReadyOrExit(opts = {}) {
  const result = await runColdPreflight({ scope: opts.scope });
  const blockingIds = blockingCheckIds(result.scope);
  const machineFailure = result.items.some((check) => blockingIds.includes(check.id));
  if (machineFailure) {
    console.error(formatColdPreflight(result));
    for (const hint of opts.hints ?? [])
      console.error(`\u2192 ${hint}`);
    process.exit(1);
  }
}
function detectRuntimePrerequisites(find = findOnPath) {
  return {
    hasDockerCli: Boolean(find("docker")),
    hasTiltCli: Boolean(find("tilt"))
  };
}
function formatRuntimeNextSteps(status) {
  const lines = [];
  if (!status.hasDockerCli) {
    lines.push(`Docker is not installed. ${DOCTOR_FIXES.dockerMissing}`);
  }
  if (!status.hasTiltCli) {
    lines.push(`Tilt is not installed. ${DOCTOR_FIXES.tiltMissing}`);
  }
  lines.push("Docker and Tilt are only needed to start the stack: start them, then run `flisk doctor` (readiness) and `flisk up`.");
  return lines;
}
export {
  MACHINE_CHECK_IDS,
  NATIVE_CHECK_IDS,
  RUNTIME_CHECK_IDS,
  SCAFFOLD_CHECK_IDS,
  assertMachineReadyOrExit,
  detectRuntimePrerequisites,
  formatColdPreflight,
  formatRuntimeNextSteps,
  nodeTooOld,
  requireVerifiedDockerVersions,
  runColdPreflight,
  usesPrisma
};
