import { BRING_YOUR_OWN_TYPE, STANDARD_PORTS } from "./constants.js";
import { resolveServicePath, resolveSubdomainBases, routesAsApi } from "./service-urls.js";
/** The `extraPorts` of a bring-your-own resource as Compose publishes them (engine/.../compose/byo_ports.star). Invalid entries are skipped. */
export function extraPortsOf(resource) {
    const config = resource.config;
    if (config?.appType !== BRING_YOUR_OWN_TYPE || !Array.isArray(config.extraPorts))
        return [];
    return config.extraPorts.flatMap((entry) => {
        if (!entry || typeof entry !== "object")
            return [];
        const { port, hostPort, protocol, bind } = entry;
        if (typeof port !== "number")
            return [];
        const host = typeof hostPort === "number" ? hostPort : port;
        const proto = protocol === "udp" ? "udp" : "tcp";
        const address = bind === "0.0.0.0" ? "0.0.0.0" : "127.0.0.1";
        return [
            {
                containerPort: port,
                hostPort: host,
                protocol: proto,
                bind: address,
                address: `${address}:${host}/${proto}`,
            },
        ];
    });
}
function resolveGatewayOption(options) {
    if (options === undefined || options === null)
        return true;
    if (typeof options === "boolean")
        return options;
    const opts = options;
    if (typeof opts.gateway === "boolean") {
        return opts.gateway;
    }
    if (opts.capabilities && typeof opts.capabilities.gateway === "boolean") {
        return opts.capabilities.gateway;
    }
    return true;
}
export function buildServicePorts(resource, ingressHttp, options) {
    const gatewayEnabled = resolveGatewayOption(options);
    const appType = resource.config?.appType;
    // A frontend or API is reached only through the gateway; its container publishes no host port of its own.
    const routedByType = appType === "frontend" || routesAsApi(resource);
    const routable = gatewayEnabled && routedByType;
    let url = null;
    if (routable) {
        const { appBase, apiBase } = resolveSubdomainBases(ingressHttp);
        url = `${routesAsApi(resource) ? apiBase : appBase}${resolveServicePath(resource)}`;
    }
    const containerPort = resource.port ?? resource.config?.port ?? null;
    // A bring-your-own container publishes nothing on the host, so localhost:<port> would not answer. Neither does a frontend or
    // API with the gateway off.
    const directUrl = !routedByType && containerPort && appType !== BRING_YOUR_OWN_TYPE
        ? `http://localhost:${containerPort}`
        : null;
    return { url, containerPort, hostPort: null, directUrl, extraPorts: extraPortsOf(resource) };
}
/** Ports a client should forward or open: ingress, Tilt UI, and the published datastore. Not one per service. */
export function buildStackPorts(plan, tiltPort, options) {
    const gatewayEnabled = resolveGatewayOption(options);
    const ports = [];
    if (plan && gatewayEnabled) {
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
