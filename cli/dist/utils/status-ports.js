import { BRING_YOUR_OWN_TYPE, STANDARD_PORTS } from "./constants.js";
import { parseHostMapping, publishVariables, substitutePublish } from "./extra-port-publish.js";
import { isWebUiBringYourOwn, resolveRouteBase, resolveServicePath, routesAsApi, } from "./service-urls.js";
/** The loopback range: a mapping on 127.x.x.x is not reachable from the network. */
export const isLoopbackAddress = (address) => /^127\./.test(address);
function resolveExtraPort(port, protocol, publish, lookup) {
    const variables = publishVariables(publish);
    if (typeof variables === "string")
        return null;
    const fromEnvironment = variables.some((variable) => Boolean(lookup(variable.name)));
    const resolved = substitutePublish(publish, lookup);
    const mapping = parseHostMapping(resolved);
    const base = { containerPort: port, protocol };
    const info = {
        template: publish,
        source: fromEnvironment ? "environment" : "default",
        variables: variables.map((variable) => variable.name),
    };
    if (!mapping) {
        // Show the default so the port stays reserved and listed; the doctor names the bad value.
        const fallback = parseHostMapping(substitutePublish(publish));
        if (!fallback)
            return null;
        const address = fallback.address ?? "0.0.0.0";
        return {
            ...base,
            hostPort: fallback.port,
            bind: address,
            address: `${address}:${fallback.port}/${protocol}`,
            publish: info,
            problem: `${variables.map((variable) => variable.name).join(", ")} resolves to "${resolved}", which is not a port or address:port such as 127.0.0.1:8080`,
        };
    }
    const address = mapping.address ?? "0.0.0.0";
    return {
        ...base,
        hostPort: mapping.port,
        bind: address,
        address: `${address}:${mapping.port}/${protocol}`,
        publish: info,
    };
}
/**
 * The `extraPorts` of a bring-your-own resource as Compose publishes them (engine/.../compose/byo_ports.star). Invalid entries are
 * skipped. A `publish` template is resolved the way Compose does it, from `lookup` (the shell, then the project `.env`: pass
 * `projectEnvLookup(projectRoot)`) and then the default in service.json; without a lookup only the shell is read.
 */
export function extraPortsOf(resource, lookup = (name) => process.env[name] || undefined) {
    const config = resource.config;
    if (config?.appType !== BRING_YOUR_OWN_TYPE || !Array.isArray(config.extraPorts))
        return [];
    return config.extraPorts.flatMap((entry) => {
        if (!entry || typeof entry !== "object")
            return [];
        const { port, hostPort, protocol, bind, publish } = entry;
        if (typeof port !== "number")
            return [];
        const proto = protocol === "udp" ? "udp" : "tcp";
        if (typeof publish === "string") {
            const resolved = resolveExtraPort(port, proto, publish, lookup);
            return resolved ? [resolved] : [];
        }
        const host = typeof hostPort === "number" ? hostPort : port;
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
export function buildServicePorts(resource, ingressHttp, options, lookup) {
    const gatewayEnabled = resolveGatewayOption(options);
    const appType = resource.config?.appType;
    // A frontend or API is reached only through the gateway; its container publishes no host port of its own.
    const routedByType = appType === "frontend" || routesAsApi(resource) || isWebUiBringYourOwn(resource);
    const routable = gatewayEnabled && routedByType;
    let url = null;
    if (routable) {
        url = `${resolveRouteBase(resource, ingressHttp)}${resolveServicePath(resource)}`;
    }
    const containerPort = resource.port ?? resource.config?.port ?? null;
    // A bring-your-own container publishes nothing on the host, so localhost:<port> would not answer. Neither does a frontend or
    // API with the gateway off.
    const directUrl = !routedByType && containerPort && appType !== BRING_YOUR_OWN_TYPE
        ? `http://localhost:${containerPort}`
        : null;
    return {
        url,
        containerPort,
        hostPort: null,
        directUrl,
        extraPorts: extraPortsOf(resource, lookup),
    };
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
