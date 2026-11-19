// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readProjectConfig, TemplateEngine } from "../../generator/template-engine.js";
import { createTempProject } from "../../test-support/index.js";
import { applyServiceLocalOverrides } from "../service-local-overrides.js";
import { clearDiscoveryResultCache, discoverResourcesFromRoot } from "../services.js";

const projectJson = {
  version: "1.0",
  project: { name: "local-overrides", version: "1.0.0" },
  discovery: { paths: ["services/*/*"] },
  optional_infra: {
    monitoring: false,
    elk: false,
    debezium: false,
    golden_image: false,
    verdaccio: false,
  },
  phases: {
    pre_alpha: { name: "Pre-Alpha", description: "", enabledStacks: ["app"] },
    alpha: { name: "Alpha", description: "", enabledStacks: [] },
    beta: { name: "Beta", description: "", enabledStacks: [] },
    out_of_scope: { name: "Out of Scope", description: "", enabledStacks: [] },
  },
};

function fixture(local?: Record<string, unknown>): string {
  return createTempProject({
    projectJson,
    files: {
      "services/app/api/service.json": JSON.stringify({
        appName: "api",
        appType: "backend",
        stack: "app",
        schemaVersion: 1,
        port: 8080,
        env: { KEEP: "committed", DROP: "committed" },
      }),
      ...(local
        ? {
            "services/app/api/service.local.json": JSON.stringify(local),
          }
        : {}),
    },
  });
}

function api(root: string) {
  const resource = discoverResourcesFromRoot(root).find((item) => item.name === "api");
  if (!resource) throw new Error("missing api fixture");
  return resource;
}

describe("service.local.json overrides", () => {
  it("overrides the port and reports the field", () => {
    const root = fixture({ port: 9100 });
    const { resources, overrides } = applyServiceLocalOverrides([api(root)]);

    expect(resources[0]?.config?.port).toBe(9100);
    expect(resources[0]?.port).toBe(9100);
    expect(overrides).toEqual([{ service: "api", field: "port" }]);
    // The cached discovery resource is never mutated: generation still sees the committed value.
    expect(api(root).config?.port).toBe(8080);
  });

  it("honors enabled: false", () => {
    const root = fixture({ enabled: false });
    const { resources, overrides } = applyServiceLocalOverrides([api(root)]);

    expect(resources[0]?.config?.enabled).toBe(false);
    expect(overrides).toEqual([{ service: "api", field: "enabled" }]);
  });

  it("overrides command", () => {
    const root = fixture({ command: "node local-server.js" });
    const { resources, overrides } = applyServiceLocalOverrides([api(root)]);

    expect(resources[0]?.config?.command).toBe("node local-server.js");
    expect(overrides).toEqual([{ service: "api", field: "command" }]);
  });

  it("merges env key by key, with null removing a key", () => {
    const root = fixture({ env: { KEEP: "local", ADD: "added", DROP: null } });
    const { resources, overrides } = applyServiceLocalOverrides([api(root)]);

    expect(resources[0]?.config?.env).toEqual({ KEEP: "local", ADD: "added" });
    expect(overrides).toEqual([{ service: "api", field: "env" }]);
    expect(api(root).config?.env).toEqual({ KEEP: "committed", DROP: "committed" });
  });

  it("rejects a field outside the whitelist, naming the file and field", () => {
    const root = fixture({ dockerfile: "Dockerfile.local" });

    expect(() => applyServiceLocalOverrides([api(root)])).toThrow(
      'service.local.json: "dockerfile" cannot be overridden',
    );
  });

  it("leaves generated Docker/Tilt output byte-identical with a local file present", () => {
    const root = fixture();
    const generate = () =>
      JSON.stringify(
        new TemplateEngine().generateAll(readProjectConfig(root), { projectRoot: root }),
      );
    const before = generate();
    const committed = api(root);

    writeFileSync(
      join(root, "services", "app", "api", "service.local.json"),
      JSON.stringify({
        port: 9100,
        enabled: false,
        command: "node local.js",
        env: { KEEP: "local" },
      }),
    );
    clearDiscoveryResultCache(root);
    expect(api(root).config).toEqual(committed.config);
    expect(generate()).toBe(before);
  });
});
