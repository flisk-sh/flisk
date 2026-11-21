// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { resolveServiceUrl } from "../service-urls.js";
import { printedHealthUrl } from "./classify.js";
/**
 * The URLs `flisk up` prints for the services it started: each routed service's URL and its health URL. Deferred services
 * (Sablier `deferStart`) are left out: a request would start them, and they are printed as starting on first request.
 */
export function buildPrintedUrlTargets(resources, ingressPort, deferred = new Set()) {
    const targets = [];
    for (const resource of resources) {
        if (deferred.has(resource.name))
            continue;
        const url = resolveServiceUrl(resource, ingressPort);
        if (!url)
            continue;
        const port = resource.config?.port;
        targets.push({ service: resource.name, url, ...(port ? { port } : {}) });
        const healthUrl = printedHealthUrl(resource, url);
        if (healthUrl)
            targets.push({ service: resource.name, url: healthUrl, ...(port ? { port } : {}) });
    }
    return targets;
}
