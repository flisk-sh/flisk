// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTempProject, runFlisk } from "../../test-support/index.js";
import type { DiscoveredResource } from "../../types/index.js";
import { FliskError } from "../../utils/errors.js";
import { createInfraServiceJson, INFRA_PRESETS } from "../../utils/infra-presets.js";
import { isNativeContainerService } from "../../utils/native-container.js";
import { findTool } from "../../utils/tool-catalog.js";
import { addTool, needsDockerForLocalProject, type ProjectView } from "../tool.js";
import { selectNativeRun } from "../up.js";

type Run = (args: string[], json: boolean) => unknown;

const localProject = (): ProjectView => ({
  native: true,
  name: "shop",
  resources: [
    { name: "shop-api", stack: "app", type: "backend" },
    { name: "shop-web", stack: "app", type: "frontend" },
  ],
});

function refuse(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

function resourceTool(id: string) {
  const tool = findTool(id);
  if (tool?.status !== "resource") throw new Error(`${id} should be a resource tool`);
  return tool;
}

function resourceOf(name: string, config: Record<string, unknown>): DiscoveredResource {
  return {
    name,
    path: join("services", "app", name),
    configPath: join("services", "app", name, "service.json"),
    config: config as DiscoveredResource["config"],
  };
}

const nativeServices = {
  api: { appName: "api", appType: "backend", command: "node server.js", port: 4000 },
  web: { appName: "web", appType: "frontend", command: "node server.js", port: 3000 },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("flisk tool add: databases in a local-process project", () => {
  it("names the shared Postgres as the one database that needs a Docker project", () => {
    expect(needsDockerForLocalProject(resourceTool("postgresql"))).toBe(true);
    expect(needsDockerForLocalProject(resourceTool("mysql"))).toBe(false);
    expect(needsDockerForLocalProject(resourceTool("mongodb"))).toBe(false);
  });

  it("refuses postgresql before calling flisk resource or writing anything", () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      lines.push(args.map(String).join(" "));
    });
    const run = vi.fn<Run>();
    let error: unknown;
    try {
      addTool(["postgresql"], { yes: true }, run, localProject);
    } catch (caught) {
      error = caught;
    }
    expect(run).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(FliskError);
    const fliskError = error as FliskError;
    expect(fliskError.message).toContain(
      "PostgreSQL cannot be added to this local-process project",
    );
    expect(fliskError.message).toContain("Nothing was written");
    expect(fliskError.suggestions.join("\n")).toContain(
      "flisk tool add mysql --yes (or flisk tool add mongodb --yes)",
    );
    expect(fliskError.suggestions).toContain(
      'To switch project "shop" to Docker, remove `command` from each service.json, or create it again with: flisk create shop --runtime docker --yes',
    );
    expect(fliskError.suggestions).toContain("Then run: flisk tool add postgresql db");
    expect(lines.join("\n")).not.toContain("flisk up app");
  });

  it("leaves the image-backed databases alone in a local-process project", () => {
    for (const [id, framework] of [
      ["mysql", "mysql"],
      ["mongodb", "mongodb"],
    ] as const) {
      const run = vi.fn<Run>();
      vi.spyOn(console, "log").mockImplementation(() => undefined);
      addTool([id], { yes: true }, run, localProject);
      expect(run).toHaveBeenCalledWith(
        [
          "resource",
          resourceTool(id).defaultName,
          "--type",
          "database",
          "--framework",
          framework,
          "--yes",
        ],
        false,
      );
      // The resource command writes a pinned image and no command, which is the mixed-run contract.
      const config = createInfraServiceJson(id, "app", id);
      expect(config.image).toBe(INFRA_PRESETS[id].image);
      expect(isNativeContainerService(resourceOf(id, config))).toBe(true);
    }
  });

  it("keeps the Docker-runtime commands unchanged for all three databases", () => {
    for (const [id, framework] of [
      ["postgresql", "postgres"],
      ["mysql", "mysql"],
      ["mongodb", "mongodb"],
    ] as const) {
      const run = vi.fn<Run>();
      vi.spyOn(console, "log").mockImplementation(() => undefined);
      addTool([id], { yes: true }, run, () => ({
        native: false,
        name: "shop",
        resources: [],
      }));
      expect(run).toHaveBeenCalledWith(
        [
          "resource",
          resourceTool(id).defaultName,
          "--type",
          "database",
          "--framework",
          framework,
          "--yes",
        ],
        false,
      );
    }
  });
});

describe("flisk tool add: the project still runs after the database step", () => {
  it("leaves no database behind on refusal, so up has nothing to mix", () => {
    const root = createTempProject({
      projectJson: { project: { name: "shop", version: "1.0.0" } },
      stacks: { app: nativeServices },
    });
    const result = runFlisk(["tool", "add", "postgresql", "--yes"], { cwd: root });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain(
      "cannot be added to this local-process project",
    );
    expect(result.stdout + result.stderr).toContain("flisk create shop --runtime docker --yes");
    expect(result.stdout + result.stderr).not.toContain("flisk up app");
    expect(existsSync(join(root, "services", "app", "db", "service.json"))).toBe(false);
    expect(() => selectNativeRun(undefined, undefined, refuse, root)).not.toThrow();
    const up = runFlisk(["up", "--dry-run"], { cwd: root });
    expect(up.stdout + up.stderr).not.toContain("mixes services that run as local processes");
  });

  it("adds mysql and mongodb as images that the local run accepts", () => {
    const root = createTempProject({
      projectJson: { project: { name: "shop", version: "1.0.0" } },
      stacks: { app: nativeServices },
    });
    for (const id of ["mysql", "mongodb"] as const) {
      const result = runFlisk(["tool", "add", id, "--yes"], { cwd: root });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      const folder = resourceTool(id).defaultName;
      const config = JSON.parse(
        readFileSync(join(root, "services", "app", folder, "service.json"), "utf-8"),
      ) as Record<string, unknown>;
      expect(config.image).toBe(INFRA_PRESETS[id].image);
      expect(config.command).toBeUndefined();
      expect(isNativeContainerService(resourceOf(folder, config))).toBe(true);
      // The printed next step is the one the native run accepts, not a Docker-only stack command.
      expect(result.stdout + result.stderr).toContain("flisk up app");
    }
    const selection = selectNativeRun(undefined, undefined, refuse, root);
    expect(selection?.selected.map((resource) => resource.name).sort()).toEqual([
      "api",
      "mongo",
      "mysql",
      "web",
    ]);
    const up = runFlisk(["up", "--dry-run"], { cwd: root });
    expect(up.stdout + up.stderr).not.toContain("mixes services that run as local processes");
  });
});
