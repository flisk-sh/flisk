// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { DiscoveredResource } from "../types/index.js";
import { BRING_YOUR_OWN_TYPE, STANDARD_PORTS } from "./constants.js";
import type { HostPortPlan } from "./host-port-plan.js";
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
}

export interface StackPort {
  name: "ingress-http" | "ingress-https" | "tilt-ui" | "postgres";
  hostPort: number;
  /** What the port is for, so a Dev Container knows which ones to forward. */
  purpose: string;
}

export function buildServicePorts(
  resource: DiscoveredResource,
  ingressHttp?: number,
): ServicePorts {
  const appType = resource.config?.appType;
  const routable = appType === "frontend" || routesAsApi(resource);
  let url: string | null = null;
  if (routable) {
    const { appBase, apiBase } = resolveSubdomainBases(ingressHttp);
    url = `${routesAsApi(resource) ? apiBase : appBase}${resolveServicePath(resource)}`;
  }
  const containerPort = resource.port ?? resource.config?.port ?? null;
  // A bring-your-own container publishes nothing on the host, so localhost:<port> would not answer.
  const directUrl =
    !routable && containerPort && appType !== BRING_YOUR_OWN_TYPE
      ? `http://localhost:${containerPort}`
      : null;
  return { url, containerPort, hostPort: null, directUrl };
}

/** Ports a client should forward or open: ingress, Tilt UI, and the published datastore. Not one per service. */
export function buildStackPorts(plan: HostPortPlan | null, tiltPort?: number): StackPort[] {
  const ports: StackPort[] = [];
  if (plan) {
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
