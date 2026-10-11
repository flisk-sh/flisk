// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveRuntimeIngressPort } from "../host-port-config.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function project(savedHttp: number | null, name = "tdk-restaurant-example"): string {
  const root = mkdtempSync(join(tmpdir(), "tdk-runtime-port-"));
  dirs.push(root);
  mkdirSync(join(root, ".tdk", ".tdk-out"), { recursive: true });
  writeFileSync(join(root, ".tdk", "project.json"), JSON.stringify({ project: { name } }));
  if (savedHttp !== null) {
    writeFileSync(
      join(root, ".tdk", ".tdk-out", "host-ports.json"),
      JSON.stringify({
        ingressHttp: savedHttp,
        ingressHttps: 8443,
        postgres: 15432,
        requested: { ingressHttp: 80, ingressHttps: 443, postgres: 5432 },
        explicit: { ingressHttp: false, ingressHttps: false, postgres: false },
        reason: { ingressHttp: "fallback", ingressHttps: "fallback", postgres: "fallback" },
      }),
    );
  }
  return root;
}

const dockerPs = (...lines: string[]) => () => lines.join("\n");

describe("resolveRuntimeIngressPort", () => {
  it("probes the saved port while this project's Traefik holds it, even though 80 is free", () => {
    const root = project(8080);
    const ps = dockerPs("tdk_restaurant_example_traefik|127.0.0.1:8080->80/tcp, 127.0.0.1:8443->443/tcp");
    expect(resolveRuntimeIngressPort(root, 80, ps)).toBe(8080);
  });

  it("keeps the planned port when the saved port is not held by this project", () => {
    const root = project(8080);
    expect(resolveRuntimeIngressPort(root, 80, dockerPs("other_project_traefik|127.0.0.1:8080->80/tcp"))).toBe(80);
    expect(resolveRuntimeIngressPort(root, 80, dockerPs())).toBe(80);
  });

  it("keeps the planned port without a saved plan, when they already agree, or when Docker fails", () => {
    expect(resolveRuntimeIngressPort(project(null), 80, dockerPs("tdk_restaurant_example_traefik|:8080->80/tcp"))).toBe(80);
    expect(resolveRuntimeIngressPort(project(80), 80, dockerPs("tdk_restaurant_example_traefik|:80->80/tcp"))).toBe(80);
    expect(
      resolveRuntimeIngressPort(project(8080), 80, () => {
        throw new Error("docker: command not found");
      }),
    ).toBe(80);
  });

  it("passes through an undefined planned port", () => {
    expect(resolveRuntimeIngressPort(project(null), undefined, dockerPs())).toBeUndefined();
  });

  it("matches only this project's container prefix, not a similarly named project", () => {
    const root = project(8080, "tdk-shop");
    expect(resolveRuntimeIngressPort(root, 80, dockerPs("tdk_shop_extra_traefik|:8080->80/tcp"))).toBe(8080);
    expect(resolveRuntimeIngressPort(root, 80, dockerPs("tdk_shopping_traefik|:8080->80/tcp"))).toBe(80);
  });
});
