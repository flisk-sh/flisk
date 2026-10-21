// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkDockerCompose,
  checkDockerRuntime,
  checkDockerVersions,
  checkTilt,
  DOCTOR_FIXES,
} from "../commands/doctor.js";
import type { CheckResult } from "../types/index.js";
import { BUN_FLOOR_LABEL, bunMeetsFloor } from "./bun-floor.js";
import { projectNeedsBun } from "./bun-requirement.js";
import { PROJECT_JSON } from "./constants.js";
import { checkNatsBroker } from "./doctor-wiring.js";
import { getHostPortPlan } from "./host-port-config.js";
import { findProjectRoot } from "./paths.js";
import { discoverResourcesFromRoot } from "./services.js";
import { findOnPath } from "./which.js";

export type PreflightItem = {
  id: "node" | "docker" | "compose" | "tilt" | "bun" | "ports" | "nats" | "prisma";
  ok: boolean;
  message: string;
  fix?: string;
};

/**
 * Which prerequisites a command needs.
 *
 * - `runtime` starts the local stack, so it needs Docker, Compose and Tilt.
 * - `scaffold` only writes project files, so it needs neither. The runtime
 *   executables are checked for the next-step hint, never to block setup.
 */
export type PreflightScope = "runtime" | "scaffold";

/** Checks that only the local runtime (starting a stack) needs. */
export const RUNTIME_CHECK_IDS: readonly PreflightItem["id"][] = ["docker", "compose", "tilt"];

/** Checks that writing project configuration needs. */
export const SCAFFOLD_CHECK_IDS: readonly PreflightItem["id"][] = ["node", "bun", "ports"];

/** Every check that blocks a cold start, in report order. */
export const MACHINE_CHECK_IDS: readonly PreflightItem["id"][] = [
  "node",
  ...RUNTIME_CHECK_IDS,
  "bun",
  "ports",
];

export type PreflightResult = {
  ok: boolean;
  inProject: boolean;
  items: PreflightItem[];
  header: string;
  footer: string;
};

type Check = () => Promise<CheckResult> | CheckResult;

/** Converts a doctor check result into the preflight's compact display item. */

function item(id: PreflightItem["id"], result: CheckResult): PreflightItem {
  return {
    id,
    ok: result.didPass || Boolean(result.isSkipped),
    message: result.message,
    fix: result.fix,
  };
}

/** Returns whether a Node version is below the CLI's 22.12 minimum. */
export function nodeTooOld(version: string): boolean {
  const [major = 0, minor = 0] = String(version)
    .split(".")
    .map((part) => Number.parseInt(part, 10));
  return (
    !Number.isFinite(major) || !Number.isFinite(minor) || major < 22 || (major === 22 && minor < 12)
  );
}

async function safeCheck(
  id: PreflightItem["id"],
  check: Check,
  fallback: string,
): Promise<PreflightItem> {
  try {
    return item(id, await check());
  } catch {
    return { id, ok: false, message: fallback };
  }
}

/** Requires a Docker engine and Compose version check to complete successfully. */
export function requireVerifiedDockerVersions(result: CheckResult): CheckResult {
  if (!result.isSkipped) return result;
  return {
    ...result,
    didPass: false,
    isSkipped: false,
    message: `Could not verify Docker Engine/Compose minimum versions: ${result.message}`,
    fix:
      result.fix ?? "Start Docker and ensure Docker Engine 25+ and Compose 2.20.2+ are installed.",
  };
}

function usesPrisma(projectRoot: string): boolean {
  try {
    return discoverResourcesFromRoot(projectRoot).some((resource) => {
      return resource.config?.featuresEnabled?.includes("prisma") ?? false;
    });
  } catch {
    return false;
  }
}

export async function runColdPreflight(
  opts: { cwd?: string; scope?: PreflightScope } = {},
): Promise<PreflightResult> {
  const cwd = opts.cwd ?? process.cwd();
  const scope = opts.scope ?? "runtime";
  const projectRoot = findProjectRoot(cwd);
  const inProject = Boolean(projectRoot);
  const items: PreflightItem[] = [];
  const nodeVersion = process.versions.node;
  items.push({
    id: "node",
    ok: !nodeTooOld(nodeVersion),
    message: nodeVersion,
    fix: nodeTooOld(nodeVersion)
      ? `Install Node.js 22.12+ (current: ${nodeVersion}). https://nodejs.org`
      : undefined,
  });

  // The runtime executables are only probed when the command actually starts a
  // stack. Scaffolding a project must not depend on a running Docker daemon.
  if (scope === "runtime") {
    items.push(await safeCheck("docker", checkDockerRuntime, "Docker daemon is not running"));
    items.push(
      await safeCheck(
        "compose",
        async () => {
          const [compose, versions] = await Promise.all([
            checkDockerCompose(),
            checkDockerVersions(),
          ]);
          if (!compose.didPass) return compose;
          return requireVerifiedDockerVersions(versions);
        },
        "Docker Engine or Compose version check failed",
      ),
    );
    items.push(await safeCheck("tilt", checkTilt, "Tilt CLI not found"));
  }
  // Outside a project Bun stays required: `flisk project` is about to create services that need it.
  const bunNeeded = projectRoot ? projectNeedsBun(discoverResourcesFromRoot(projectRoot)) : true;
  let bun = false;
  const bunPath = bunNeeded ? findOnPath("bun") : undefined;
  if (bunPath) {
    try {
      const version = execFileSync(bunPath, ["--version"], {
        encoding: "utf-8",
        timeout: 3000,
      }).trim();
      bun = bunMeetsFloor(version);
    } catch {
      /* reported as a failed runtime check */
    }
  }
  items.push(
    bunNeeded
      ? {
          id: "bun",
          ok: bun,
          message: bun
            ? `Bun ${BUN_FLOOR_LABEL} is available on PATH`
            : `Bun ${BUN_FLOOR_LABEL} not found on PATH`,
          fix: bun ? undefined : "curl -fsSL https://bun.sh/install | bash",
        }
      : { id: "bun", ok: true, message: "Bun not needed: no generated JS services" },
  );
  try {
    // Scaffolding must not talk to Docker at all, so the port plan is planned
    // from the host ports alone.
    const plan = await getHostPortPlan(
      projectRoot ?? cwd,
      scope === "scaffold" ? { inspectDocker: false } : {},
    );
    items.push({
      id: "ports",
      ok: true,
      message: `HTTP ${plan.ingressHttp}, HTTPS ${plan.ingressHttps}, Postgres ${plan.postgres}`,
    });
  } catch (error) {
    items.push({
      id: "ports",
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      fix: "Set TDK_HTTP_PORT, TDK_HTTPS_PORT, or TDK_POSTGRES_PORT to available host ports.",
    });
  }

  // Project wiring (NATS, Prisma database) describes a running stack, so it is
  // only probed for the runtime scope.
  if (projectRoot && scope === "runtime") {
    const nats = await safeCheck(
      "nats",
      () => checkNatsBroker(projectRoot),
      "NATS broker check failed",
    );
    if (!nats.ok) items.push(nats);
    if (usesPrisma(projectRoot)) {
      let dbUp = false;
      try {
        const config = JSON.parse(readFileSync(join(projectRoot, ".tdk", PROJECT_JSON), "utf-8"));
        const projectName = String(config?.project?.name ?? "").replace(/-/g, "_");
        if (projectName) {
          const running = execFileSync(
            findOnPath("docker") ?? "docker",
            [
              "ps",
              "--filter",
              `label=com.docker.compose.project=${projectName}`,
              "--filter",
              "label=com.docker.compose.service=postgres",
              "--filter",
              "health=healthy",
              "--format",
              "{{.Names}}",
            ],
            { encoding: "utf-8", timeout: 3000 },
          ).trim();
          dbUp = running.length > 0;
        }
      } catch {
        /* Docker unavailable is already represented by the machine checks. */
      }
      if (!dbUp)
        items.push({
          id: "prisma",
          ok: false,
          message:
            "A Prisma resource is configured, but the project Postgres service is not healthy",
          fix: "Run `flisk up` to start the bundled Postgres, then check `flisk doctor`.",
        });
    }
  }

  const failures = items.filter((check) => !check.ok).slice(0, 8);
  const blockingIds = scope === "scaffold" ? SCAFFOLD_CHECK_IDS : MACHINE_CHECK_IDS;
  const machineFailed = failures.some((check) => blockingIds.includes(check.id));
  const bunFailed = failures.some((check) => check.id === "bun");
  const header = failures.length
    ? machineFailed
      ? scope === "scaffold"
        ? bunFailed
          ? `Project setup blocked. Bun ${BUN_FLOOR_LABEL} must be installed on PATH.\nFix the machine checks below.`
          : "Project setup blocked. Fix the machine checks below."
        : bunFailed
          ? `Cold start blocked. Bun ${BUN_FLOOR_LABEL} must be installed on PATH.\nPrisma/NATS configuration is project-specific and generated after \`flisk project\`. Fix the machine checks below.`
          : "Cold start blocked. Bun/Prisma/NATS are not the first failure.\nThey are generated after `flisk project`. Fix the machine checks below."
      : "Machine is ready. Project wiring is not."
    : "";
  const footer = failures.length
    ? ""
    : inProject
      ? "Environment ready for Flisk"
      : "This machine is ready for Flisk.\nNext: flisk project --yes";
  return { ok: failures.length === 0, inProject, items: failures, header, footer };
}

/** Formats only failed preflight checks and the applicable readiness message. */
export function formatColdPreflight(
  result: PreflightResult,
  options: { includeSuccessFooter?: boolean } = {},
): string {
  const lines = [result.header];
  for (const check of result.items) {
    lines.push(`FAIL ${check.id.padEnd(7)} ${check.message}`);
    if (check.fix) lines.push(`  ${check.fix}`);
  }
  if (result.footer && (options.includeSuccessFooter ?? true)) lines.push(result.footer);
  return lines.filter(Boolean).join("\n");
}

/** Exits before machine-dependent command work when any machine check fails. */
export async function assertMachineReadyOrExit(
  opts: { scope?: PreflightScope } = {},
): Promise<void> {
  const scope = opts.scope ?? "runtime";
  const result = await runColdPreflight({ scope });
  const blockingIds = scope === "scaffold" ? SCAFFOLD_CHECK_IDS : MACHINE_CHECK_IDS;
  const machineFailure = result.items.some((check) => blockingIds.includes(check.id));
  if (machineFailure) {
    console.error(formatColdPreflight(result));
    process.exit(1);
  }
}

export type RuntimePrerequisiteStatus = {
  hasDockerCli: boolean;
  hasTiltCli: boolean;
};

/**
 * Reports which runtime executables are installed.
 *
 * It only looks at `PATH`: no Docker daemon is contacted, so a machine without
 * Docker still gets a usable answer.
 */
export function detectRuntimePrerequisites(
  find: (command: string) => string | null = findOnPath,
): RuntimePrerequisiteStatus {
  return {
    hasDockerCli: Boolean(find("docker")),
    hasTiltCli: Boolean(find("tilt")),
  };
}

/**
 * Builds the next-step lines shown after project setup.
 *
 * Docker and Tilt are only needed to start the stack, so a missing runtime is
 * reported as a hint instead of a failure.
 */
export function formatRuntimeNextSteps(status: RuntimePrerequisiteStatus): string[] {
  const lines: string[] = [];
  if (!status.hasDockerCli) {
    lines.push(`Docker is not installed. ${DOCTOR_FIXES.dockerMissing}`);
  }
  if (!status.hasTiltCli) {
    lines.push(`Tilt is not installed. ${DOCTOR_FIXES.tiltMissing}`);
  }
  lines.push(
    "Docker and Tilt are only needed to start the stack: start them, then run `flisk doctor` (readiness) and `flisk up`.",
  );
  return lines;
}
