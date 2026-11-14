// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { createTempProject, parseEnvelope, runFlisk } from "../../test-support/index.js";
import { projectNeedsContainerFiles, verifyMasterConfigs } from "../template-engine.js";

const projectJson = (name: string) => ({
  version: "1.0",
  project: { name, version: "1.0.0" },
  phases: Object.fromEntries(
    ["pre_alpha", "alpha", "beta", "out_of_scope"].map((phase) => [
      phase,
      { name: phase, description: "", enabledStacks: [] },
    ]),
  ),
  optional_infra: {
    monitoring: false,
    elk: false,
    debezium: false,
    golden_image: false,
    verdaccio: false,
  },
  discovery: { paths: ["services/*/*"] },
});

const localService = (port: number) => ({
  schemaVersion: 1,
  appType: "backend",
  command: "node server.js",
  port,
});
const containerService = (port: number) => ({ schemaVersion: 1, appType: "backend", port });

const localProject = () =>
  createTempProject({
    projectJson: projectJson("verify-local"),
    stacks: { app: { api: localService(4101), web: localService(4102) } },
  });
const mixedProject = () =>
  createTempProject({
    projectJson: projectJson("verify-mixed"),
    stacks: { app: { api: localService(4101), db: containerService(4103) } },
  });

describe("config verify for a local-process project (#4204)", () => {
  it("does not need container files when every service has a command", () => {
    expect(projectNeedsContainerFiles(localProject())).toBe(false);
  });

  it("verifies valid with no Missing file errors", () => {
    const result = verifyMasterConfigs(localProject());
    expect(result.errors.filter((error) => error.startsWith("Missing file"))).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("still requires the container files in a mixed project", () => {
    const root = mixedProject();
    expect(projectNeedsContainerFiles(root)).toBe(true);
    const errors = verifyMasterConfigs(root).errors;
    expect(errors).toContain(
      "Missing file: .flisk/.flisk-out/Tiltfile (run 'flisk config regenerate')",
    );
    expect(errors).toContain("Missing file: .tiltignore (run 'flisk config regenerate')");
  });

  it("still requires the container files in a project with no services", () => {
    const root = createTempProject({ projectJson: projectJson("verify-empty") });
    expect(projectNeedsContainerFiles(root)).toBe(true);
  });

  it("gives the same answer through the CLI that the config_verify MCP tool runs", () => {
    const local = runFlisk(["config", "verify", "--json"], { cwd: localProject() });
    expect(local.status).toBe(0);
    const report = parseEnvelope(local.stdout);
    expect(report.data.valid).toBe(true);
    expect(JSON.stringify(report.data.errors)).not.toContain("Missing file");

    const mixed = runFlisk(["config", "verify", "--json"], { cwd: mixedProject() });
    expect(mixed.status).toBe(1);
    expect(parseEnvelope(mixed.stdout).data.errors).toContain(
      "Missing file: .flisk/.flisk-out/Tiltfile (run 'flisk config regenerate')",
    );
  }, 120_000);
});
