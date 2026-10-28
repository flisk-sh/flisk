// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BRING_YOUR_OWN_TYPE, PROJECT_JSON } from "./constants.js";
import { findProjectRoot } from "./paths.js";
import { isApiServiceType } from "./resource-kind.js";
/**
 * A bring-your-own service with a Traefik route (the default; `exposeViaProxy: false` turns it off). The engine routes it like a
 * backend, at the API host under /api/<name>, and publishes nothing on the host, so this route is the only address it has.
 */
export function isRoutedBringYourOwn(resource) {
    return (resource.config?.appType === BRING_YOUR_OWN_TYPE && resource.config?.exposeViaProxy !== false);
}
/** Routed at the API host: backends, MCP servers, agents and routed bring-your-own services. */
export function routesAsApi(resource) {
    return isApiServiceType(resource.config?.appType) || isRoutedBringYourOwn(resource);
}
export function getProjectName() {
    return getProjectNameFor(findProjectRoot());
}
/** The project name of a specific project root, for tools that work outside the current directory. */
export function getProjectNameFor(root) {
    if (root) {
        try {
            const content = readFileSync(join(root, ".flisk", PROJECT_JSON), "utf-8");
            const parsed = JSON.parse(content);
            if (parsed?.project?.name) {
                return parsed.project.name;
            }
        }
        catch { }
    }
    return "flisk-project";
}
export function resolveSubdomainBases(ingressPort, projectRoot) {
    const projectName = getProjectNameFor(projectRoot ?? findProjectRoot());
    const raw = process.env.FLISK_SERVICE_BASE_URL ??
        `http://${projectName}.localhost${ingressPort ? `:${ingressPort}` : ""}`;
    try {
        const u = new URL(raw.includes("://") ? raw : `http://${raw}`);
        const host = u.hostname;
        // URL drops a default port (80 for http, 443 for https), so u.port is empty
        // for http://x.localhost:80. Keep it empty instead of re-adding ingressPort.
        const defaultPort = u.protocol === "https:" ? "443" : "80";
        const explicitPort = u.port || (ingressPort ? String(ingressPort) : "");
        const port = explicitPort === defaultPort ? "" : explicitPort;
        if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
            return {
                appBase: `${u.protocol}//${host}${port ? `:${port}` : ""}`,
                apiBase: `${u.protocol}//${host}${port ? `:${port}` : ""}`,
            };
        }
        const bare = host.replace(/^(app|api)\./, "");
        return {
            appBase: `${u.protocol}//app.${bare}${port ? `:${port}` : ""}`,
            apiBase: `${u.protocol}//api.${bare}${port ? `:${port}` : ""}`,
        };
    }
    catch {
        return {
            appBase: `http://app.${projectName}.localhost`,
            apiBase: `http://api.${projectName}.localhost`,
        };
    }
}
export function appendHealthPath(path) {
    return `${path.replace(/\/+$/, "")}/health`;
}
/** The route `flisk up` advertises for a service, without the /health suffix. */
export function resolveServicePath(resource) {
    if (routesAsApi(resource)) {
        const servicePathName = resource.name.replace(/-api$/, "");
        return resource.config?.apiPath ?? `/api/${servicePathName}`;
    }
    return resource.config?.basePath ?? `/${resource.name}`;
}
/**
 * The ingress URL of one service (no /health suffix), or undefined for services with no Traefik route. This is where the service
 * answers, unlike the Tilt UI port, which serves its own page for any path.
 */
export function resolveServiceUrl(resource, ingressPort) {
    const appType = resource.config?.appType;
    if (appType !== "frontend" && !routesAsApi(resource))
        return undefined;
    const { appBase, apiBase } = resolveSubdomainBases(ingressPort);
    return `${appType === "frontend" ? appBase : apiBase}${resolveServicePath(resource)}`;
}
/**
 * Health URLs for every routable service, matching what `flisk up` prints.
 * Workers, libraries, SDKs and migrators have no Traefik route, so they are
 * skipped rather than reported as unreachable.
 */
export function buildHealthTargets(resources, ingressPort) {
    return routableTargets(resources, ingressPort, (path) => appendHealthPath(path));
}
/**
 * The URL `flisk up` and `flisk networks` advertise for each routable service, with no suffix. A service can answer /health while
 * this URL is a 404 (nothing handles the bare path), which is the dead link users click.
 */
export function buildAdvertisedTargets(resources, ingressPort) {
    // A routed bring-your-own service is advertised too: its route is the only address it has. It is not a health target, because
    // its health path is its own (often /), not /health.
    return routableTargets(resources, ingressPort, (path) => path, true);
}
function routableTargets(resources, ingressPort, toPath, includeBringYourOwn = false) {
    const { appBase, apiBase } = resolveSubdomainBases(ingressPort);
    return resources
        .filter((resource) => resource.config?.appType === "frontend" ||
        isApiServiceType(resource.config?.appType) ||
        (includeBringYourOwn && isRoutedBringYourOwn(resource)))
        .map((resource) => {
        const base = routesAsApi(resource) ? apiBase : appBase;
        return {
            name: resource.name,
            appType: resource.config.appType,
            url: `${base}${toPath(resolveServicePath(resource))}`,
        };
    });
}
export async function pingHealthTarget(target, timeoutMs) {
    try {
        const response = await fetch(target.url, {
            method: "GET",
            redirect: "manual",
            signal: AbortSignal.timeout(timeoutMs),
        });
        return { ...target, ok: response.ok, status: response.status };
    }
    catch (err) {
        const error = err instanceof Error && err.name === "TimeoutError"
            ? `no response within ${timeoutMs}ms`
            : err instanceof Error
                ? err.message
                : String(err);
        return { ...target, ok: false, error };
    }
}
export async function pingHealthTargets(targets, timeoutMs) {
    return Promise.all(targets.map((target) => pingHealthTarget(target, timeoutMs)));
}
