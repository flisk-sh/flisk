// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
const LABELS = {
    kiri: "Kiri",
    colima: "Colima",
    orbstack: "OrbStack",
    "docker-desktop": "Docker Desktop",
    podman: "Podman",
    "docker-engine": "Docker Engine",
    unknown: "Docker",
};
const VM_ENGINES = new Set(["kiri", "colima", "orbstack", "docker-desktop"]);
/**
 * Which engine answers `docker`, from what the daemon says about itself and the endpoint in use.
 * The daemon's own answer wins over the environment, because a wrapper or `DOCKER_HOST` can point
 * `docker` at a different daemon than the active context names.
 */
export function detectEngine(info, env = process.env) {
    const name = (info.Name ?? "").toLowerCase();
    const os = (info.OperatingSystem ?? "").toLowerCase();
    const host = env.DOCKER_HOST ?? "";
    const context = env.DOCKER_CONTEXT ?? "";
    let id = "unknown";
    if (os === "kiri" || name === "kiri" || host.includes("/.kiri/") || context === "kiri") {
        id = "kiri";
    }
    else if (os.includes("orbstack") || name === "orbstack" || host.includes(".orbstack")) {
        id = "orbstack";
    }
    else if (name.startsWith("colima") ||
        host.includes(".colima") ||
        context.startsWith("colima")) {
        id = "colima";
    }
    else if (os.includes("docker desktop") || name === "docker-desktop") {
        id = "docker-desktop";
    }
    else if (os.includes("podman") || host.includes("podman")) {
        id = "podman";
    }
    else if (os) {
        id = "docker-engine";
    }
    const version = info.ServerVersion ? ` (engine ${info.ServerVersion})` : "";
    return { id, label: `${LABELS[id]}${version}`, vm: VM_ENGINES.has(id) };
}
/** Parses the JSON `docker info` prints; an unreadable answer is an unknown engine. */
export function parseDockerInfo(raw) {
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    }
    catch {
        return {};
    }
}
/** The Docker CLI's active context, read from its config file without starting a process. */
export function currentDockerContext(home, read) {
    try {
        const config = JSON.parse(read(`${home}/.docker/config.json`));
        return config.currentContext;
    }
    catch {
        return undefined;
    }
}
/**
 * Kiri has no BuildKit of its own. `docker build` there starts a BuildKit container that rejects
 * `--network host` and cannot see local images, which breaks every golden-image build. Kiri's classic
 * builder (`DOCKER_BUILDKIT=0`) accepts both, so Flisk and every command it starts use it unless the
 * caller already chose.
 */
export function kiriBuildEnv(env, context) {
    if (env.DOCKER_BUILDKIT !== undefined)
        return {};
    const host = env.DOCKER_HOST ?? "";
    const onKiri = host ? host.includes("/.kiri/") : (env.DOCKER_CONTEXT ?? context) === "kiri";
    return onKiri ? { DOCKER_BUILDKIT: "0" } : {};
}
