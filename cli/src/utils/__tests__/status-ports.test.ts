// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import type { DiscoveredResource } from "../../types/index.js";
import type { HostPortPlan } from "../host-port-plan.js";
import { buildServicePorts, buildStackPorts } from "../status-ports.js";

const resource = (name: string, appType: string, port?: number): DiscoveredResource =>
  ({ name, path: "", configPath: "", port, config: { appName: name, appType } }) as never;

const plan = { ingressHttp: 8080, ingressHttps: 8443, postgres: 15432 } as HostPortPlan;

describe("buildServicePorts", () => {
  it("gives routable services an ingress url, a container port and a null hostPort", () => {
    const ports = buildServicePorts(resource("orders-api", "backend", 4000), 8080);
    expect(ports.containerPort).toBe(4000);
    expect(ports.hostPort).toBeNull();
    expect(ports.url).toMatch(/^http:\/\/.+:8080\/api\/orders$/);
  });
  it("has no url for resources without a route", () => {
    expect(buildServicePorts(resource("jobs", "worker", 6000), 8080).url).toBeNull();
  });
  it("gives an unrouted resource with a known port a direct loopback url", () => {
    expect(buildServicePorts(resource("sourcing-api", "bring-your-own", 4002), 8080).directUrl).toBe("http://localhost:4002");
    expect(buildServicePorts(resource("sourcing-api", "bring-your-own", 4002), 8080).url).toBeNull();
  });
  it("has no direct url for an unrouted resource without a port, or for a routed one", () => {
    expect(buildServicePorts(resource("jobs", "worker"), 8080).directUrl).toBeNull();
    expect(buildServicePorts(resource("orders-api", "backend", 4000), 8080).directUrl).toBeNull();
  });
  it("reports a null containerPort when none is known", () => {
    expect(buildServicePorts(resource("web", "frontend"), 8080).containerPort).toBeNull();
  });
});

describe("buildStackPorts", () => {
  it("lists ingress, Tilt UI and Postgres, and nothing per service", () => {
    expect(buildStackPorts(plan, 10351).map((p) => [p.name, p.hostPort])).toEqual([
      ["ingress-http", 8080],
      ["ingress-https", 8443],
      ["tilt-ui", 10351],
      ["postgres", 15432],
    ]);
  });
  it("ignores an invalid Tilt port", () => {
    const tilt = (value: number) => buildStackPorts(plan, value).find((p) => p.name === "tilt-ui");
    expect(tilt(Number.NaN)?.hostPort).toBe(10350);
    expect(tilt(-1)?.hostPort).toBe(10350);
  });
  it("falls back to the Tilt UI alone when port planning failed", () => {
    expect(buildStackPorts(null).map((p) => p.name)).toEqual(["tilt-ui"]);
  });
});
