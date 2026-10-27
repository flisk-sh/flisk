// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { createTempDir, createTempProject, runCommandInProcess } from "../../test-support/index.js";
import { MASTER_CONFIG_FILES } from "../../utils/constants.js";
import { clearDiscoveryCache } from "../../utils/discovery-context.js";
import { stripTerminalControls } from "../../utils/tilt-events.js";

async function freshProjectsCommand(): Promise<Command> {
  vi.resetModules();
  clearDiscoveryCache();
  return (await import("../projects.js")).projectsCommand;
}

describe("flisk projects (human-readable)", () => {
  it("prints empty-state missing master configuration when no master files exist", async () => {
    const projectRoot = createTempProject({
      generated: [],
    });

    const command = await freshProjectsCommand();
    const result = await runCommandInProcess(command, [], projectRoot);

    expect(result.status).toBeUndefined();
    expect(result.stderr).toBe("");

    const output = stripTerminalControls(result.stdout);
    expect(output).toContain("Project Information");
    expect(output).toContain("Project Root:");
    expect(output).toContain(projectRoot);
    expect(output).toContain("Master Configuration:");
    for (const file of MASTER_CONFIG_FILES) {
      expect(output).toContain(`  ✗ ${file} (missing)`);
      expect(output).not.toContain(`  ✓ ${file}`);
    }
    expect(output).toContain("Project Stats:");
    expect(output).toContain("  Resources: 0");
    expect(output).toContain("  Stacks:    0");
    expect(output).not.toContain("Unassigned:");
    expect(output).not.toContain("Stacks:\n");
    expect(output).toContain("Project not fully configured!");
    expect(output).toContain('Run "flisk project" to create master config files.');
    expect(output).not.toContain("Quick commands:");
  });

  it("exits with status 1 with --check when no master files exist", async () => {
    const projectRoot = createTempProject({
      generated: [],
    });

    const command = await freshProjectsCommand();
    const result = await runCommandInProcess(command, ["--check"], projectRoot);

    expect(result.status).toBe(1);
    const output = stripTerminalControls(result.stdout);
    expect(output).toContain("Project not fully configured!");
    for (const file of MASTER_CONFIG_FILES) {
      expect(output).toContain(`  ✗ ${file} (missing)`);
    }
  });

  it("prints partial status when only some master files are missing", async () => {
    const projectRoot = createTempProject({
      generated: ["TILT_TECH_STACK.star", "spec.master"],
    });

    const command = await freshProjectsCommand();
    const result = await runCommandInProcess(command, [], projectRoot);

    expect(result.status).toBeUndefined();
    expect(result.stderr).toBe("");

    const output = stripTerminalControls(result.stdout);
    expect(output).toContain("Master Configuration:");
    expect(output).toContain("  ✓ TILT_TECH_STACK.star");
    expect(output).toContain("  ✗ TILT_RESOURCE_DEFAULTS.star (missing)");
    expect(output).toContain("  ✓ spec.master");
    expect(output).not.toContain("  ✗ TILT_TECH_STACK.star");
    expect(output).not.toContain("  ✗ spec.master");
    expect(output).not.toContain("  ✓ TILT_RESOURCE_DEFAULTS.star");
    expect(output).toContain("Project not fully configured!");
    expect(output).toContain('Run "flisk project" to create master config files.');
    expect(output).not.toContain("Quick commands:");
  });

  it("exits with status 1 with --check when some master files are missing", async () => {
    const projectRoot = createTempProject({
      generated: ["TILT_TECH_STACK.star"],
    });

    const command = await freshProjectsCommand();
    const result = await runCommandInProcess(command, ["--check"], projectRoot);

    expect(result.status).toBe(1);
    const output = stripTerminalControls(result.stdout);
    expect(output).toContain("  ✓ TILT_TECH_STACK.star");
    expect(output).toContain("  ✗ TILT_RESOURCE_DEFAULTS.star (missing)");
    expect(output).toContain("  ✗ spec.master (missing)");
    expect(output).toContain("Project not fully configured!");
  });

  it("prints quick commands and check passes with status 0 when all master files exist", async () => {
    const projectRoot = createTempProject({
      generated: [...MASTER_CONFIG_FILES],
      stacks: {
        backend: {
          api: { runtime: "node" },
        },
      },
      resources: {
        worker: { runtime: "node" },
      },
    });

    const command = await freshProjectsCommand();
    const result = await runCommandInProcess(command, [], projectRoot);

    expect(result.status).toBeUndefined();
    expect(result.stderr).toBe("");

    const output = stripTerminalControls(result.stdout);
    expect(output).toContain("Master Configuration:");
    for (const file of MASTER_CONFIG_FILES) {
      expect(output).toContain(`  ✓ ${file}`);
    }
    expect(output).not.toContain("(missing)");
    expect(output).not.toContain("Project not fully configured!");

    expect(output).toContain("Project Stats:");
    expect(output).toContain("  Resources: 2");
    expect(output).toContain("  Stacks:    1");
    expect(output).toContain("  ⚠ Unassigned: 1 resource");
    expect(output).toContain("Stacks:");
    expect(output).toContain("  backend (1 resource)");

    expect(output).toContain("Quick commands:");
    expect(output).toContain("  flisk resource    - Create a new resource");
    expect(output).toContain("  flisk stack       - Organize resources into stacks");
    expect(output).toContain("  flisk up <stack>  - Start a stack");

    // Test --check on fully configured project
    const checkCommand = await freshProjectsCommand();
    const checkResult = await runCommandInProcess(checkCommand, ["--check"], projectRoot);
    expect(checkResult.status).toBe(0);
  });

  it("fails with exit status 1 when running outside a project", async () => {
    const emptyDir = createTempDir("flisk-projects-outside-");
    const command = await freshProjectsCommand();
    const result = await runCommandInProcess(command, [], emptyDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Could not find project root");
  });
});
