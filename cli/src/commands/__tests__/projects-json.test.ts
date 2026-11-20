// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { createTempProject, runFlisk } from "../../test-support/index.js";

const masterConfigFiles = ["TILT_TECH_STACK.star", "TILT_RESOURCE_DEFAULTS.star", "spec.master"];

function createProject(configured: boolean | string[]): string {
  return createTempProject({
    resources: {
      api: { runtime: "node", stack: "backend" },
      worker: { runtime: "node" },
    },
    generated: configured === true ? masterConfigFiles : configured === false ? [] : configured,
  });
}

function runProjects(projectRoot: string, check: boolean) {
  return runFlisk(["projects", "--json", ...(check ? ["--check"] : [])], {
    cwd: projectRoot,
    env: { NO_COLOR: undefined, FORCE_COLOR: "1" },
  });
}

function parseReport(result: ReturnType<typeof runProjects>) {
  expect(result.stderr).toBe("");
  expect(result.stdout).not.toContain("\u001b[");
  return JSON.parse(result.stdout);
}

describe("flisk projects --json", () => {
  it("prints the project report without --check and returns 1 for missing config with --check", () => {
    const projectRoot = createProject(false);
    const plain = runProjects(projectRoot, false);
    expect(plain.status).toBe(0);
    const report = parseReport(plain);
    expect(report).toMatchObject({
      schemaVersion: 1,
      data: {
        projectRoot,
        configured: false,
        missingFiles: masterConfigFiles,
        resources: 2,
        stacks: ["backend"],
        unassignedResources: 1,
      },
      errors: [],
    });

    const checked = runProjects(projectRoot, true);
    expect(checked.status).toBe(1);
    expect(parseReport(checked)).toEqual(report);
  });

  it("returns 0 for a configured project with --check", () => {
    const projectRoot = createProject(true);
    const result = runProjects(projectRoot, true);
    expect(result.status).toBe(0);
    expect(parseReport(result)).toMatchObject({
      schemaVersion: 1,
      data: {
        projectRoot,
        configured: true,
        missingFiles: [],
        resources: 2,
        stacks: ["backend"],
        unassignedResources: 1,
      },
      errors: [],
    });
  });

  it("reports a local-process project as configured with no Tilt master files missing (#4434)", () => {
    const projectRoot = createTempProject({
      generated: [],
      resources: {
        api: { appType: "backend", runtime: "node", command: "node server.js" },
      },
    });

    const result = runProjects(projectRoot, true);
    expect(result.status).toBe(0);
    expect(parseReport(result)).toMatchObject({
      schemaVersion: 1,
      data: {
        projectRoot,
        configured: true,
        missingFiles: [],
        resources: 1,
        stacks: [],
        unassignedResources: 1,
      },
      errors: [],
    });

    // The text report agrees: it names no Tilt master file and no missing check.
    const text = runFlisk(["info"], { cwd: projectRoot, env: { NO_COLOR: "1" } });
    expect(text.status).toBe(0);
    expect(text.stdout).not.toContain("(missing)");
    for (const file of masterConfigFiles) {
      expect(text.stdout).not.toContain(file);
    }
  });

  it("lists only the missing master files when the project is partially configured", () => {
    const projectRoot = createProject(["TILT_TECH_STACK.star", "spec.master"]);
    const result = runProjects(projectRoot, true);
    expect(result.status).toBe(1);
    expect(parseReport(result)).toMatchObject({
      data: { configured: false, missingFiles: ["TILT_RESOURCE_DEFAULTS.star"] },
      errors: [],
    });
  });

  it("lists running projects with exit 0 when no project root exists", () => {
    const emptyDir = createTempProject({ projectJson: null });
    const result = runProjects(emptyDir, false);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("\u001b[");
    const body = JSON.parse(result.stdout);
    expect(body.errors).toEqual([]);
    expect(body.data.projects).toEqual(expect.any(Array));
  }, 30_000);

  it("reports a machine error with exit 1 for --check when no project root exists", () => {
    const emptyDir = createTempProject({ projectJson: null });
    const result = runProjects(emptyDir, true);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Could not find project root");
    expect(result.stdout).not.toContain("\u001b[");
    const body = JSON.parse(result.stdout);
    expect(body.data).toBeNull();
    expect(body.errors[0].code).toBe("NOT_IN_PROJECT");
  }, 30_000);
});
