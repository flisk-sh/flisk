// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import fs from "node:fs";
import path from "node:path";
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
    const result = verifyMasterConfigs(root);
    expect(result.state).toBe("not_generated");
    expect(result.errors[0]).toContain("Not generated yet");
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
    const mixedReport = parseEnvelope(mixed.stdout).data;
    expect(mixedReport.state).toBe("not_generated");
    expect(mixedReport.errors).toHaveLength(1);
    expect(mixedReport.errors[0]).toContain("Not generated yet");
    expect(mixedReport.diffs).toEqual([]);
    expect(mixed.stdout.length).toBeLessThan(2048);
  }, 120_000);
});

describe("config verify for a never-generated container project (#4219)", () => {
  const generate = (root: string) => {
    const result = runFlisk(["config", "regenerate", "--json"], { cwd: root });
    expect(result.status).toBe(0);
  };

  it("reports one short finding, not one error per file", () => {
    const root = mixedProject();
    const result = verifyMasterConfigs(root);
    expect(result.state).toBe("not_generated");
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("flisk up");
    expect(result.errors[0]).toContain("flisk config regenerate");
    expect(result.diffs).toEqual([]);
  });

  it("is valid after the master files are generated", () => {
    const root = mixedProject();
    generate(root);
    const result = verifyMasterConfigs(root);
    expect(result.state).toBe("generated");
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  }, 120_000);

  it("still reports one deleted master file as drift", () => {
    const root = mixedProject();
    generate(root);
    fs.rmSync(path.join(root, ".flisk", ".flisk-out", "Tiltfile"));
    const result = verifyMasterConfigs(root);
    expect(result.state).toBe("generated");
    expect(result.errors).toEqual([
      "Missing file: .flisk/.flisk-out/Tiltfile (run 'flisk config regenerate')",
    ]);
    expect(result.diffs).toHaveLength(1);
  }, 120_000);

  it("still reports an edited master file as drift", () => {
    const root = mixedProject();
    generate(root);
    fs.appendFileSync(path.join(root, ".flisk", ".flisk-out", "Tiltfile"), "# hand edit\n");
    const result = verifyMasterConfigs(root);
    expect(result.errors[0]).toContain("Out of sync: .flisk/.flisk-out/Tiltfile");
  }, 120_000);

  it("prints a short message in text mode", () => {
    const text = runFlisk(["config", "verify"], { cwd: mixedProject() });
    expect(text.status).toBe(1);
    expect(text.stdout).toContain("Not generated yet");
    expect(text.stdout).not.toContain("Missing file");
  }, 120_000);
});
