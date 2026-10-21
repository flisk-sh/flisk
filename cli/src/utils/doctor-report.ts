// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { CheckResult } from "../types/index.js";
import type { HostInfo } from "./agent-host.js";
import { CONTAINER_RUNTIME_CHECK } from "./constants.js";
import type { DoctorAction } from "./doctor-fix.js";
import type { HostPortPlan } from "./host-port-plan.js";
import { SCHEMA_VERSION } from "./machine-output.js";

export interface DoctorError {
  code: "USAGE" | "INTERNAL" | "ENV_UNREADABLE";
  message: string;
}

export interface DoctorReport {
  schemaVersion: typeof SCHEMA_VERSION;
  data: {
    ready: boolean;
    inProject: boolean;
    checks: CheckResult[];
    /** Present only with `--fix`: every repair planned, applied, skipped or failed. */
    actions?: DoctorAction[];
    host?: HostInfo & { containerRuntimeReachable: boolean | null };
    ports?: {
      http: { requested: number; chosen: number | null; explicit: boolean; reason: string };
      https: { requested: number; chosen: number | null; explicit: boolean; reason: string };
      postgres: { requested: number; chosen: number | null; explicit: boolean; reason: string };
    };
  };
  errors: DoctorError[];
}

type DoctorCheck = () => CheckResult | Promise<CheckResult>;

/** Wait for concurrent probes to finish even if one throws, so they can release resources. */
export async function collectDoctorChecks(
  machineChecks: DoctorCheck[],
  projectChecks: DoctorCheck[],
): Promise<{ checks: CheckResult[]; errors: DoctorError[] }> {
  const checks: CheckResult[] = [];
  const errors: DoctorError[] = [];
  const append = (result: PromiseSettledResult<CheckResult>): void => {
    if (result.status === "fulfilled") checks.push(result.value);
    else
      errors.push({
        code: "INTERNAL",
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
  };
  for (const result of await Promise.allSettled(
    machineChecks.map((check) => Promise.resolve().then(check)),
  )) {
    append(result);
  }
  for (const check of projectChecks) {
    for (const result of await Promise.allSettled([Promise.resolve().then(check)])) append(result);
  }
  return { checks, errors };
}

function containerRuntimeReachable(checks: CheckResult[]): boolean | null {
  const runtime = checks.find((check) => check.name === CONTAINER_RUNTIME_CHECK);
  return runtime ? runtime.didPass : null;
}

/** Produce the same readiness decision for human and machine consumers. */
export function createDoctorReport(
  checks: CheckResult[],
  inProject: boolean,
  errors: DoctorError[] = [],
  portPlan?: HostPortPlan | null,
  host?: HostInfo,
): DoctorReport {
  return {
    schemaVersion: SCHEMA_VERSION,
    data: {
      ready:
        errors.length === 0 &&
        checks.every((check) => check.didPass || check.isSkipped || check.isWarning),
      inProject,
      checks,
      ...(host
        ? {
            host: {
              ...host,
              containerRuntimeReachable: containerRuntimeReachable(checks),
              canUp: host.canUp && containerRuntimeReachable(checks) !== false,
            },
          }
        : {}),
      ...(portPlan !== undefined
        ? {
            ports: {
              http: {
                requested: portPlan?.requested.ingressHttp ?? 80,
                chosen: portPlan?.ingressHttp ?? null,
                explicit: portPlan?.explicit.ingressHttp ?? Boolean(process.env.TDK_HTTP_PORT),
                reason: portPlan?.reason.ingressHttp ?? "port planning failed",
              },
              https: {
                requested: portPlan?.requested.ingressHttps ?? 443,
                chosen: portPlan?.ingressHttps ?? null,
                explicit: portPlan?.explicit.ingressHttps ?? Boolean(process.env.TDK_HTTPS_PORT),
                reason: portPlan?.reason.ingressHttps ?? "port planning failed",
              },
              postgres: {
                requested: portPlan?.requested.postgres ?? 5432,
                chosen: portPlan?.postgres ?? null,
                explicit: portPlan?.explicit.postgres ?? Boolean(process.env.TDK_POSTGRES_PORT),
                reason: portPlan?.reason.postgres ?? "port planning failed",
              },
            },
          }
        : {}),
    },
    errors,
  };
}

/** 0: ready (warnings permitted), 1: blocking findings, 2: usage/internal failure. */
export function getDoctorExitCode(report: DoctorReport): 0 | 1 | 2 {
  return report.errors.length > 0 ? 2 : report.data.ready ? 0 : 1;
}
