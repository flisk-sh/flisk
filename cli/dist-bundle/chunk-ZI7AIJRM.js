import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  isWebUiBringYourOwn,
  parseHostMapping,
  publishVariables,
  resolveRouteBase,
  resolveServicePath,
  routesAsApi,
  substitutePublish
} from "./chunk-2BH5UW2N.js";
import {
  BRING_YOUR_OWN_TYPE,
  STANDARD_PORTS
} from "./chunk-73W4Y4TI.js";

// dist/utils/status-ports.js
var isLoopbackAddress = (address) => /^127\./.test(address);
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
    variables: variables.map((variable) => variable.name)
  };
  if (!mapping) {
    const fallback = parseHostMapping(substitutePublish(publish));
    if (!fallback)
      return null;
    const address2 = fallback.address ?? "0.0.0.0";
    return {
      ...base,
      hostPort: fallback.port,
      bind: address2,
      address: `${address2}:${fallback.port}/${protocol}`,
      publish: info,
      problem: `${variables.map((variable) => variable.name).join(", ")} resolves to "${resolved}", which is not a port or address:port such as 127.0.0.1:8080`
    };
  }
  const address = mapping.address ?? "0.0.0.0";
  return {
    ...base,
    hostPort: mapping.port,
    bind: address,
    address: `${address}:${mapping.port}/${protocol}`,
    publish: info
  };
}
function extraPortsOf(resource, lookup = (name) => process.env[name] || void 0) {
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
        address: `${address}:${host}/${proto}`
      }
    ];
  });
}
function resolveGatewayOption(options) {
  if (options === void 0 || options === null)
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
function buildServicePorts(resource, ingressHttp, options, lookup) {
  const gatewayEnabled = resolveGatewayOption(options);
  const appType = resource.config?.appType;
  const containerPort = resource.port ?? resource.config?.port ?? null;
  if (typeof options === "object" && options !== null && "native" in options && options.native) {
    return {
      url: null,
      containerPort,
      hostPort: null,
      directUrl: containerPort ? `http://localhost:${containerPort}` : null,
      extraPorts: extraPortsOf(resource, lookup)
    };
  }
  const routedByType = appType === "frontend" || routesAsApi(resource) || isWebUiBringYourOwn(resource);
  const routable = gatewayEnabled && routedByType;
  let url = null;
  if (routable) {
    url = `${resolveRouteBase(resource, ingressHttp)}${resolveServicePath(resource)}`;
  }
  const directUrl = !routedByType && containerPort && appType !== BRING_YOUR_OWN_TYPE ? `http://localhost:${containerPort}` : null;
  return {
    url,
    containerPort,
    hostPort: null,
    directUrl,
    extraPorts: extraPortsOf(resource, lookup)
  };
}
function buildStackPorts(plan, tiltPort, options) {
  const gatewayEnabled = resolveGatewayOption(options);
  const ports = [];
  if (plan && gatewayEnabled) {
    ports.push({ name: "ingress-http", hostPort: plan.ingressHttp, purpose: "Traefik HTTP ingress" }, { name: "ingress-https", hostPort: plan.ingressHttps, purpose: "Traefik HTTPS ingress" });
  }
  const validTiltPort = tiltPort !== void 0 && Number.isInteger(tiltPort) && tiltPort > 0;
  ports.push({
    name: "tilt-ui",
    hostPort: validTiltPort ? tiltPort : STANDARD_PORTS.tiltUi,
    purpose: "Tilt UI"
  });
  if (plan) {
    ports.push({ name: "postgres", hostPort: plan.postgres, purpose: "Published Postgres" });
  }
  return ports;
}

export {
  isLoopbackAddress,
  extraPortsOf,
  buildServicePorts,
  buildStackPorts
};
