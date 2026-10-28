import { BRING_YOUR_OWN_TYPE, STANDARD_PORTS } from "./constants.js";
import { resolveServicePath, resolveSubdomainBases, routesAsApi } from "./service-urls.js";
export function buildServicePorts(resource, ingressHttp) {
    const appType = resource.config?.appType;
    const routable = appType === "frontend" || routesAsApi(resource);
    let url = null;
    if (routable) {
        const { appBase, apiBase } = resolveSubdomainBases(ingressHttp);
        url = `${routesAsApi(resource) ? apiBase : appBase}${resolveServicePath(resource)}`;
    }
    const containerPort = resource.port ?? resource.config?.port ?? null;
    // A bring-your-own container publishes nothing on the host, so localhost:<port> would not answer.
    const directUrl = !routable && containerPort && appType !== BRING_YOUR_OWN_TYPE
        ? `http://localhost:${containerPort}`
        : null;
    return { url, containerPort, hostPort: null, directUrl };
}
/** Ports a client should forward or open: ingress, Tilt UI, and the published datastore. Not one per service. */
export function buildStackPorts(plan, tiltPort) {
    const ports = [];
    if (plan) {
        ports.push({ name: "ingress-http", hostPort: plan.ingressHttp, purpose: "Traefik HTTP ingress" }, { name: "ingress-https", hostPort: plan.ingressHttps, purpose: "Traefik HTTPS ingress" });
    }
    // `flisk up` may move Tilt off 10350 and records that only in its own process, so this is the default or TILT_PORT.
    const validTiltPort = tiltPort !== undefined && Number.isInteger(tiltPort) && tiltPort > 0;
    ports.push({
        name: "tilt-ui",
        hostPort: validTiltPort ? tiltPort : STANDARD_PORTS.tiltUi,
        purpose: "Tilt UI",
    });
    if (plan) {
        ports.push({ name: "postgres", hostPort: plan.postgres, purpose: "Published Postgres" });
    }
    return ports;
}
