// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { DiscoveredResource, HostPortPlan, ProjectCapabilities } from "../types/index.js";
import { BRING_YOUR_OWN_TYPE, STANDARD_PORTS } from "./constants.js";
import { parseHostMapping, publishVariables, substitutePublish } from "./extra-port-publish.js";
import { resolveServicePath, resolveSubdomainBases, routesAsApi } from "./service-urls.js";

export interface ServicePorts {
  /** Ingress address (Traefik), or null for resources with no route (workers, libraries, migrators). */
  url: string | null;
  /** The port the process listens on inside its container. */
  containerPort: number | null;
  /** A direct host mapping. Flisk publishes services only through the ingress, so this is null today. */
  hostPort: number | null;
  /** Loopback address for a resource with no route but a known port, such as a bring-your-own app. Null otherwise. */
  directUrl: string | null;
  /** Plain host ports of a bring-your-own resource (`extraPorts`), published on 127.0.0.1. Empty for everything else. */
  extraPorts: ExtraPort[];
}

export interface ExtraPort {
  containerPort: number;
  hostPort: number;
  protocol: "tcp" | "udp";
  /**
   * Host address it is published on: 127.0.0.1, 0.0.0.0 when service.json opts in to every interface, or whatever a `publish`
   * template resolves to. A `publish` that names only a port publishes on every interface, which Docker reads as 0.0.0.0.
   */
  bind: string;
  /** Published address, such as 127.0.0.1:443/tcp. */
  address: string;
  /** Set for a `publish` template: the variables behind it and where the shown value came from. */
  publish?: { template: string; source: "default" | "environment"; variables: string[] };
  /** Set when a `publish` variable holds a value that is not a port or address:port, so Compose would refuse it. */
  problem?: string;
}

/** The loopback range: a mapping on 127.x.x.x is not reachable from the network. */
export const isLoopbackAddress = (address: string): boolean => /^127\./.test(address);

function resolveExtraPort(
  port: number,
  protocol: "tcp" | "udp",
  publish: string,
  lookup: (name: string) => string | undefined,
): ExtraPort | null {
  const variables = publishVariables(publish);
  if (typeof variables === "string") return null;
  const fromEnvironment = variables.some((variable) => Boolean(lookup(variable.name)));
  const resolved = substitutePublish(publish, lookup);
  const mapping = parseHostMapping(resolved);
  const base = { containerPort: port, protocol };
  const info = {
    template: publish,
    source: fromEnvironment ? ("environment" as const) : ("default" as const),
    variables: variables.map((variable) => variable.name),
  };
  if (!mapping) {
    // Show the default so the port stays reserved and listed; the doctor names the bad value.
    const fallback = parseHostMapping(substitutePublish(publish));
    if (!fallback) return null;
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
export function extraPortsOf(
  resource: DiscoveredResource,
  lookup: (name: string) => string | undefined = (name) => process.env[name] || undefined,
): ExtraPort[] {
  const config = resource.config as { appType?: string; extraPorts?: unknown } | undefined;
  if (config?.appType !== BRING_YOUR_OWN_TYPE || !Array.isArray(config.extraPorts)) return [];
  return config.extraPorts.flatMap((entry: unknown): ExtraPort[] => {
    if (!entry || typeof entry !== "object") return [];
    const { port, hostPort, protocol, bind, publish } = entry as Record<string, unknown>;
    if (typeof port !== "number") return [];
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

export interface StackPort {
  name: "ingress-http" | "ingress-https" | "tilt-ui" | "postgres";
  hostPort: number;
  /** What the port is for, so a Dev Container knows which ones to forward. */
  purpose: string;
}

export type StackPortsOptions =
  | { capabilities?: ProjectCapabilities; gateway?: boolean }
  | ProjectCapabilities
  | boolean;

function resolveGatewayOption(options?: StackPortsOptions): boolean {
  if (options === undefined || options === null) return true;
  if (typeof options === "boolean") return options;
  const opts = options as { gateway?: boolean; capabilities?: ProjectCapabilities };
  if (typeof opts.gateway === "boolean") {
    return opts.gateway;
  }
  if (opts.capabilities && typeof opts.capabilities.gateway === "boolean") {
    return opts.capabilities.gateway;
  }
  return true;
}

export function buildServicePorts(
  resource: DiscoveredResource,
  ingressHttp?: number,
  options?: StackPortsOptions,
  lookup?: (name: string) => string | undefined,
): ServicePorts {
  const gatewayEnabled = resolveGatewayOption(options);
  const appType = resource.config?.appType;
  // A frontend or API is reached only through the gateway; its container publishes no host port of its own.
  const routedByType = appType === "frontend" || routesAsApi(resource);
  const routable = gatewayEnabled && routedByType;
  let url: string | null = null;
  if (routable) {
    const { appBase, apiBase } = resolveSubdomainBases(ingressHttp);
    url = `${routesAsApi(resource) ? apiBase : appBase}${resolveServicePath(resource)}`;
  }
  const containerPort = resource.port ?? resource.config?.port ?? null;
  // A bring-your-own container publishes nothing on the host, so localhost:<port> would not answer. Neither does a frontend or
  // API with the gateway off.
  const directUrl =
    !routedByType && containerPort && appType !== BRING_YOUR_OWN_TYPE
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
export function buildStackPorts(
  plan: HostPortPlan | null,
  tiltPort?: number,
  options?: StackPortsOptions,
): StackPort[] {
  const gatewayEnabled = resolveGatewayOption(options);
  const ports: StackPort[] = [];
  if (plan && gatewayEnabled) {
    ports.push(
      { name: "ingress-http", hostPort: plan.ingressHttp, purpose: "Traefik HTTP ingress" },
      { name: "ingress-https", hostPort: plan.ingressHttps, purpose: "Traefik HTTPS ingress" },
    );
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
