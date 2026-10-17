import { CONTAINER_RUNTIME_CHECK } from "./constants.js";
import { SCHEMA_VERSION } from "./machine-output.js";
/** Wait for concurrent probes to finish even if one throws, so they can release resources. */
export async function collectDoctorChecks(machineChecks, projectChecks) {
    const checks = [];
    const errors = [];
    const append = (result) => {
        if (result.status === "fulfilled")
            checks.push(result.value);
        else
            errors.push({
                code: "INTERNAL",
                message: result.reason instanceof Error ? result.reason.message : String(result.reason),
            });
    };
    for (const result of await Promise.allSettled(machineChecks.map((check) => Promise.resolve().then(check)))) {
        append(result);
    }
    for (const check of projectChecks) {
        for (const result of await Promise.allSettled([Promise.resolve().then(check)]))
            append(result);
    }
    return { checks, errors };
}
function containerRuntimeReachable(checks) {
    const runtime = checks.find((check) => check.name === CONTAINER_RUNTIME_CHECK);
    return runtime ? runtime.didPass : null;
}
/** Produce the same readiness decision for human and machine consumers. */
export function createDoctorReport(checks, inProject, errors = [], portPlan, host) {
    return {
        schemaVersion: SCHEMA_VERSION,
        data: {
            ready: errors.length === 0 &&
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
export function getDoctorExitCode(report) {
    return report.errors.length > 0 ? 2 : report.data.ready ? 0 : 1;
}
