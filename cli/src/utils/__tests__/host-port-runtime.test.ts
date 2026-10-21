// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isPortHeldByProjectContainers, resolveRuntimeIngressPort } from "../host-port-config.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function project(savedHttp: number | null, name = "tdk-restaurant-example"): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "tdk-runtime-port-")));
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

/** One `docker ps` line: name|ports|compose working directory. */
const line = (name: string, ports: string, workingDir: string) => `${name}|${ports}|${workingDir}`;
const ps =
  (...lines: string[]) =>
  () =>
    lines.join("\n");

describe("resolveRuntimeIngressPort", () => {
  it("probes the saved port while this project's Traefik holds it, even though 80 is free", () => {
    const root = project(8080);
    const docker = ps(
      line(
        "tdk_restaurant_example_traefik",
        "127.0.0.1:8080->80/tcp",
        join(root, ".tdk", ".tdk-out"),
      ),
    );
    expect(resolveRuntimeIngressPort(root, 80, docker)).toBe(8080);
  });

  it("keeps the planned port when the saved port is held by another project", () => {
    const root = project(8080);
    const other = project(8080, "other-project");
    const docker = ps(
      line("other_project_traefik", "127.0.0.1:8080->80/tcp", join(other, ".tdk", ".tdk-out")),
    );
    expect(resolveRuntimeIngressPort(root, 80, docker)).toBe(80);
    expect(resolveRuntimeIngressPort(root, 80, ps())).toBe(80);
  });

  it("does not mistake a project whose name starts with this one's for this project", () => {
    // tdk-shop-extra's containers are named tdk_shop_extra_*, which a tdk_shop_ prefix match would claim.
    const shop = project(8080, "tdk-shop");
    const shopExtra = project(8080, "tdk-shop-extra");
    const docker = ps(
      line("tdk_shop_extra_traefik", "127.0.0.1:8080->80/tcp", join(shopExtra, ".tdk", ".tdk-out")),
    );
    expect(resolveRuntimeIngressPort(shop, 80, docker)).toBe(80);
    expect(resolveRuntimeIngressPort(shopExtra, 80, docker)).toBe(8080);
  });

  it("keeps the planned port without a saved plan, when they agree, or when Docker fails", () => {
    const withoutPlan = project(null);
    const claim = ps(
      line(
        "tdk_restaurant_example_traefik",
        ":8080->80/tcp",
        join(withoutPlan, ".tdk", ".tdk-out"),
      ),
    );
    expect(resolveRuntimeIngressPort(withoutPlan, 80, claim)).toBe(80);
    const agreed = project(80);
    expect(
      resolveRuntimeIngressPort(agreed, 80, ps(line("t_traefik", ":80->80/tcp", agreed))),
    ).toBe(80);
    expect(
      resolveRuntimeIngressPort(project(8080), 80, () => {
        throw new Error("docker: command not found");
      }),
    ).toBe(80);
  });

  it("passes through an undefined planned port", () => {
    expect(resolveRuntimeIngressPort(project(null), undefined, ps())).toBeUndefined();
  });
});

describe("isPortHeldByProjectContainers", () => {
  it("requires the compose working directory to be inside the project and the port to match", () => {
    const root = project(null);
    const inside = join(root, ".tdk", ".tdk-out");
    expect(
      isPortHeldByProjectContainers(line("a", "0.0.0.0:8080->80/tcp", inside), root, 8080),
    ).toBe(true);
    expect(
      isPortHeldByProjectContainers(line("a", "0.0.0.0:8080->80/tcp", inside), root, 8081),
    ).toBe(false);
    expect(isPortHeldByProjectContainers(line("a", "0.0.0.0:8080->80/tcp", root), root, 8080)).toBe(
      true,
    );
    expect(
      isPortHeldByProjectContainers(
        line("a", "0.0.0.0:8080->80/tcp", `${root}-sibling`),
        root,
        8080,
      ),
    ).toBe(false);
    expect(
      isPortHeldByProjectContainers(
        line("a", "0.0.0.0:8080->80/tcp", "/somewhere/else"),
        root,
        8080,
      ),
    ).toBe(false);
  });

  it("never counts a container without a compose label", () => {
    const root = project(null);
    expect(
      isPortHeldByProjectContainers(
        line("tdk_restaurant_example_traefik", ":8080->80/tcp", ""),
        root,
        8080,
      ),
    ).toBe(false);
    expect(
      isPortHeldByProjectContainers("tdk_restaurant_example_traefik|:8080->80/tcp", root, 8080),
    ).toBe(false);
    expect(isPortHeldByProjectContainers("", root, 8080)).toBe(false);
  });

  it("matches a project reached through a symlink", () => {
    const root = project(null);
    const link = join(tmpdir(), `tdk-link-${process.pid}-${Date.now()}`);
    symlinkSync(root, link);
    dirs.push(link);
    expect(
      isPortHeldByProjectContainers(line("a", ":8080->80/tcp", join(root, ".tdk")), link, 8080),
    ).toBe(true);
  });
});
