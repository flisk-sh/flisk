// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { PROJECT_JSON } from "./constants.js";
import { createHostPortPlan, isHostPortAvailable, PREFERRED_HOST_PORTS, } from "./host-port-plan.js";
const CONFIG_PATH = join(".tdk", ".tdk-out", "host-ports.json");
export function isDockerPortOwnedByProject(dockerPs, projectPrefix, port) {
    return dockerPs.split("\n").some((line) => {
        const [name = "", ports = ""] = line.split("|");
        const containerName = name.toLowerCase();
        const prefix = projectPrefix.toLowerCase();
        return ((containerName.startsWith(`${prefix}_`) || containerName.startsWith(`${prefix}-`)) &&
            ports.includes(`:${port}->`));
    });
}
export function readSavedHostPortPlan(projectRoot) {
    const path = join(projectRoot, CONFIG_PATH);
    if (!existsSync(path))
        return null;
    try {
        const value = JSON.parse(readFileSync(path, "utf-8"));
        if (!value || typeof value !== "object")
            return null;
        const plan = value;
        if (!Number.isInteger(plan.ingressHttp) ||
            !Number.isInteger(plan.ingressHttps) ||
            !Number.isInteger(plan.postgres) ||
            !plan.requested ||
            !plan.explicit ||
            !plan.reason)
            return null;
        return plan;
    }
    catch {
        return null;
    }
}
export function writeSavedHostPortPlan(projectRoot, plan) {
    const path = join(projectRoot, CONFIG_PATH);
    mkdirSync(join(projectRoot, ".tdk", ".tdk-out"), { recursive: true });
    writeFileSync(path, `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
}
export function exportHostPortPlan(plan) {
    process.env.TDK_HTTP_PORT = String(plan.ingressHttp);
    process.env.TDK_HTTPS_PORT = String(plan.ingressHttps);
    process.env.TDK_POSTGRES_PORT = String(plan.postgres);
}
const COMPOSE_WORKING_DIR_LABEL = "com.docker.compose.project.working_dir";
/**
 * True when a container whose Compose working directory is inside this project publishes the port. A container-name prefix is not
 * enough: tdk_shop_ also matches the containers of a different project called tdk-shop-extra. Compose records the directory each
 * project was started from, so that identifies the project exactly. Containers without the label never count.
 */
export function isPortHeldByProjectContainers(dockerPs, projectRoot, port) {
    const roots = new Set([resolve(projectRoot)]);
    try {
        roots.add(realpathSync(projectRoot));
    }
    catch {
        // The project root is already known to exist; keep the unresolved path.
    }
    return dockerPs.split("\n").some((line) => {
        const [, ports = "", workingDir = ""] = line.split("|");
        if (!workingDir || !ports.includes(`:${port}->`))
            return false;
        return [...roots].some((root) => workingDir === root || workingDir.startsWith(`${root}${sep}`));
    });
}
/**
 * The HTTP ingress port to probe while a stack is running. getHostPortPlan moves a saved fallback port (8080) back to the
 * preferred one (80) as soon as that is free, which is right for the next `tdk up` but wrong for a running stack: Traefik is still
 * bound to the saved port, so probing the planned one finds nothing and every runtime check is skipped. When this project's own
 * containers hold the saved port, probe that one.
 */
export function resolveRuntimeIngressPort(projectRoot, plannedPort, readDockerPs = () => execFileSync("docker", ["ps", "--format", `{{.Names}}|{{.Ports}}|{{.Label "${COMPOSE_WORKING_DIR_LABEL}"}}`], { encoding: "utf-8", timeout: 5000 })) {
    const saved = readSavedHostPortPlan(projectRoot);
    if (!saved || saved.ingressHttp === plannedPort)
        return plannedPort;
    try {
        if (isPortHeldByProjectContainers(readDockerPs(), projectRoot, saved.ingressHttp)) {
            return saved.ingressHttp;
        }
    }
    catch {
        // Docker unavailable: keep the planned port.
    }
    return plannedPort;
}
/** Reuse this project's last selection when its ports are still free or held by its own containers. */
export async function getHostPortPlan(projectRoot, options = {}) {
    const saved = readSavedHostPortPlan(projectRoot);
    const hasOverride = ["TDK_HTTP_PORT", "TDK_HTTPS_PORT", "TDK_POSTGRES_PORT"].some((key) => process.env[key]);
    // Dry-run must not call Docker. A saved plan is the best representation of
    // the current landscape in that mode; explicit overrides are still planned.
    if (options.inspectDocker === false && saved && !hasOverride)
        return saved;
    let prefix = "";
    try {
        const project = JSON.parse(readFileSync(join(projectRoot, ".tdk", PROJECT_JSON), "utf-8"));
        prefix = String(project?.project?.name ?? "tdk-project")
            .replace(/-/g, "_")
            .toLowerCase();
    }
    catch {
        prefix = "tdk_project";
    }
    let dockerPs = "";
    if (options.inspectDocker !== false) {
        try {
            dockerPs = execFileSync("docker", ["ps", "--format", "{{.Names}}|{{.Ports}}"], {
                encoding: "utf-8",
                timeout: 5000,
            });
        }
        catch {
            // If Docker is down, reuse only when host binds are still available.
        }
    }
    const ownedByProject = (port) => isDockerPortOwnedByProject(dockerPs, prefix, port);
    const isPortFree = options.isPortFree ?? isHostPortAvailable;
    const isAvailable = async (port) => (await isPortFree(port)) || ownedByProject(port);
    if (saved && !hasOverride) {
        for (const port of [saved.ingressHttp, saved.ingressHttps, saved.postgres]) {
            if (!(await isAvailable(port)))
                return createHostPortPlan({ isAvailable });
        }
        // A plan saved on a fallback port (8080) moves back to the preferred one (80)
        // once that is free, so URLs lose the port without deleting host-ports.json.
        for (const [key, preferred] of Object.entries(PREFERRED_HOST_PORTS)) {
            const savedPort = saved[key];
            if (preferred !== undefined && savedPort !== preferred && (await isAvailable(preferred))) {
                return createHostPortPlan({ isAvailable });
            }
        }
        return saved;
    }
    return createHostPortPlan({ isAvailable });
}
