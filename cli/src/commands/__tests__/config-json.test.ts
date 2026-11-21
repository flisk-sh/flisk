// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempProject, parseEnvelope, runFlisk } from "../../test-support/index.js";

const verifyProject = (name: string) => ({
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

const runVerify = (projectRoot: string) =>
  runFlisk(["config", "verify", "--json"], { cwd: projectRoot });

// Each case spawns the built CLI. Under the parallel suite and a loaded machine that exceeds 20-30s, so the budget is 120s.
describe("flisk config verify --json", () => {
  it("prints one JSON report and exits 1 for drift without Commander diagnostics", () => {
    const projectRoot = createTempProject({ projectJson: verifyProject("verify-json") });
    // A generated project with one file deleted: a never-generated one is a single finding (#4219).
    expect(runFlisk(["config", "regenerate", "--json"], { cwd: projectRoot }).status).toBe(0);
    fs.rmSync(path.join(projectRoot, ".flisk", ".flisk-out", "Tiltfile"));

    const result = runVerify(projectRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    const report = parseEnvelope(result.stdout);
    expect(report).toMatchObject({
      schemaVersion: 1,
      data: { valid: false },
      errors: [],
    });
    expect(report.data.errors).toContain(
      "Missing file: .flisk/.flisk-out/Tiltfile (run 'flisk config regenerate')",
    );
    expect(
      report.data.diffs.find((diff: { file: string }) => diff.file.endsWith("Tiltfile")),
    ).toMatchObject({
      state: "missing",
      linesAdded: expect.any(Number),
      linesRemoved: 0,
    });
  }, 120_000);

  it("keeps the default JSON report small and offers opt-in diffs (#4205)", () => {
    // A generated project with five missing master files and one edited one.
    const projectRoot = createTempProject({
      projectJson: verifyProject("verify-budget"),
      generated: { "spec.master": "# old\n" },
    });

    const result = runVerify(projectRoot);

    expect(result.status).toBe(1);
    expect(result.stdout.length).toBeLessThan(4096);
    const report = parseEnvelope(result.stdout);
    expect(report.data.state).toBe("generated");
    expect(report.data.diffs).toHaveLength(6);
    expect(report.data.diffLineLimit).toBeGreaterThan(0);
    for (const entry of report.data.diffs) {
      expect(entry).toMatchObject({
        file: expect.any(String),
        state: expect.stringMatching(/^(missing|different)$/),
        linesAdded: expect.any(Number),
        linesRemoved: expect.any(Number),
      });
      expect(entry.diff).toBeUndefined();
    }
    for (const error of report.data.errors) {
      expect(result.stdout).toContain(error);
    }

    const withDiff = runFlisk(["config", "verify", "--diff", "Tiltfile", "--json"], {
      cwd: projectRoot,
    });
    expect(withDiff.status).toBe(1);
    const detailed = parseEnvelope(withDiff.stdout).data;
    const tiltfileDiff = detailed.diffs.find((entry: { file: string }) =>
      entry.file.endsWith("Tiltfile"),
    );
    expect(tiltfileDiff.diff).toContain("+++ b/.flisk/.flisk-out/Tiltfile");
    expect(tiltfileDiff.diff.split("\n").length).toBeLessThanOrEqual(detailed.diffLineLimit + 4);
    expect(
      detailed.diffs.filter((entry: { diff?: string }) => entry.diff !== undefined),
    ).toHaveLength(1);
  }, 120_000);

  it("emits a structured INTERNAL error and exits 2 for invalid project JSON", () => {
    const projectRoot = createTempProject({ projectJson: "{invalid\n" });

    const result = runVerify(projectRoot);

    expect(result.status).toBe(2);
    expect(parseEnvelope(result.stdout)).toMatchObject({
      schemaVersion: 1,
      data: null,
      errors: [{ code: "INTERNAL" }],
    });
    expect(result.stderr).toContain("JSON");
  }, 120_000);

  it("names a malformed service.json in the single JSON report and exits 1", () => {
    const projectRoot = createTempProject({
      projectJson: verifyProject("verify-bad-service"),
      resources: { "shop/api": "{invalid\n" },
    });

    const result = runVerify(projectRoot);

    expect(result.status).toBe(1);
    // The CLI may also warn on stderr about the skipped manifest; only stdout has to stay machine-readable.
    const report = parseEnvelope(result.stdout);
    expect(report).toMatchObject({ schemaVersion: 1, data: { valid: false }, errors: [] });
    expect(report.data.errors).toContainEqual(
      expect.stringMatching(/^services\/shop\/api\/service\.json: invalid JSON \(/),
    );
  }, 120_000);
  it.each([0, -5, 65536, 99999])(
    "reports port %d, which flisk up refuses",
    (port) => {
      const backend = { appType: "backend", type: "backend", dependsOn: [] };
      const projectRoot = createTempProject({
        projectJson: verifyProject("verify-port-range"),
        stacks: {
          shop: {
            api: { ...backend, port },
            edge: { ...backend, port: 1 },
            top: { ...backend, port: 65535 },
          },
        },
      });

      const result = runVerify(projectRoot);

      expect(result.status).toBe(1);
      const report = parseEnvelope(result.stdout);
      expect(report.data.valid).toBe(false);
      const portErrors = report.data.errors.filter((error: string) =>
        /not an integer from 1 to 65535/.test(error),
      );
      expect(portErrors).toHaveLength(1);
      expect(portErrors[0]).toContain(
        `services/shop/api/service.json port ${port}: not an integer from 1 to 65535`,
      );
    },
    120_000,
  );

  it("reports an appName used by two resources, which flisk up refuses", () => {
    const backend = { appType: "backend", type: "backend", dependsOn: [] };
    const projectRoot = createTempProject({
      projectJson: verifyProject("verify-app-names"),
      stacks: {
        shop: {
          api: { ...backend, port: 4000, appName: "web" },
          web: { appType: "frontend", type: "frontend", dependsOn: [], port: 3000, appName: "web" },
        },
      },
    });

    const result = runVerify(projectRoot);

    expect(result.status).toBe(1);
    const report = parseEnvelope(result.stdout);
    expect(report.data.valid).toBe(false);
    expect(report.data.errors).toContainEqual(
      expect.stringMatching(
        /appName used by more than one resource:\n {4}"web" in services\/shop\/(api|web)\/service\.json and/,
      ),
    );
  }, 120_000);

  it("reports a port flisk up refuses and warns about two backends on one port", () => {
    const backend = { appType: "backend", type: "backend", dependsOn: [] };
    const projectRoot = createTempProject({
      projectJson: verifyProject("verify-ports"),
      stacks: {
        shop: {
          billing: { ...backend, port: 4000 },
          orders: { ...backend, port: 4000 },
          mailer: { ...backend, port: "4002" },
        },
      },
    });

    const result = runVerify(projectRoot);

    expect(result.status).toBe(1);
    const report = parseEnvelope(result.stdout);
    expect(report.data.valid).toBe(false);
    expect(report.data.errors).toContainEqual(
      expect.stringContaining(
        'services/shop/mailer/service.json port "4002": not an integer from 1 to 65535',
      ),
    );
    expect(report.data.warnings).toContainEqual(
      expect.stringMatching(/port 4000: (billing, orders|orders, billing)/),
    );
  }, 120_000);

  it("reports a Dockerfile port mismatch in --json, naming the resource and both ports", () => {
    const backend = { appType: "backend", type: "backend", healthCheckPath: "/health", port: 4011 };
    const projectRoot = createTempProject({
      projectJson: verifyProject("verify-dockerfile-port"),
      stacks: { shop: { api: backend } },
      files: {
        "services/shop/api/Dockerfile":
          "ENV PORT=4010\nEXPOSE 4010\nHEALTHCHECK CMD bun -e \"fetch('http://localhost:4010/health')\"\n",
      },
    });

    const result = runVerify(projectRoot);

    expect(result.status).toBe(1);
    const report = parseEnvelope(result.stdout);
    expect(report.data.valid).toBe(false);
    expect(report.data.errors).toContainEqual(
      expect.stringMatching(/services\/shop\/api\/service\.json.*4011.*4010|4011.*4010/),
    );
    expect(report.data.errors).toContainEqual(
      expect.stringContaining("services/shop/api/Dockerfile"),
    );
  }, 120_000);

  it("reports no Dockerfile port mismatch when service.json and the Dockerfile agree", () => {
    const backend = { appType: "backend", type: "backend", healthCheckPath: "/health", port: 4010 };
    const projectRoot = createTempProject({
      projectJson: verifyProject("verify-dockerfile-port-ok"),
      stacks: { shop: { api: backend } },
      files: {
        "services/shop/api/Dockerfile":
          "ENV PORT=4010\nEXPOSE 4010\nHEALTHCHECK CMD bun -e \"fetch('http://localhost:4010/health')\"\n",
      },
    });

    const result = runVerify(projectRoot);

    const report = parseEnvelope(result.stdout);
    expect(
      report.data.errors.some((e: string) =>
        /services\/shop\/api\/Dockerfile|port mismatch|disagrees with/.test(e),
      ),
    ).toBe(false);
  }, 120_000);

  it("checks a custom dockerfile resolved through buildContext", () => {
    const backend = {
      appType: "backend",
      type: "backend",
      port: 4011,
      dockerfile: "Dockerfile.dev",
      buildContext: "docker",
    };
    const projectRoot = createTempProject({
      projectJson: verifyProject("verify-dockerfile-custom"),
      stacks: { shop: { api: backend } },
      files: {
        "services/shop/api/docker/Dockerfile.dev": "FROM scratch\nENV PORT=4010\nEXPOSE 4010\n",
      },
    });

    const result = runVerify(projectRoot);

    expect(result.status).toBe(1);
    const report = parseEnvelope(result.stdout);
    expect(
      report.data.errors.some((e: string) =>
        /services\/shop\/api\/docker\/Dockerfile\.dev.*4010/.test(e),
      ),
    ).toBe(true);
  }, 120_000);

  it("checks only the final stage of a multi-stage Dockerfile", () => {
    const backend = { appType: "backend", type: "backend", port: 4010 };
    const projectRoot = createTempProject({
      projectJson: verifyProject("verify-dockerfile-multistage"),
      stacks: { shop: { api: backend } },
      files: {
        "services/shop/api/Dockerfile":
          "FROM node:20 AS build\nENV PORT=3000\nEXPOSE 3000\nFROM node:20\nENV PORT=4010\nEXPOSE 4010\n",
      },
    });

    const result = runVerify(projectRoot);

    const report = parseEnvelope(result.stdout);
    expect(
      report.data.errors.some((e: string) => /Dockerfile|port mismatch|disagrees with/.test(e)),
    ).toBe(false);
  }, 120_000);

  it("ignores localhost ports in comments, ENV URLs and RUN commands", () => {
    const backend = { appType: "backend", type: "backend", port: 4010 };
    const projectRoot = createTempProject({
      projectJson: verifyProject("verify-dockerfile-false-positive"),
      stacks: { shop: { api: backend } },
      files: {
        "services/shop/api/Dockerfile":
          "FROM node:20\n# HEALTHCHECK CMD curl http://localhost:9999\nENV UPSTREAM_URL=http://localhost:9999\nRUN curl http://localhost:9999\nENV PORT=4010\nEXPOSE 4010\nHEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://127.0.0.1:4010/health\n",
      },
    });

    const result = runVerify(projectRoot);

    const report = parseEnvelope(result.stdout);
    expect(
      report.data.errors.some((e: string) => /Dockerfile|port mismatch|disagrees with/.test(e)),
    ).toBe(false);
  }, 120_000);

  it("names the mismatch in text mode too", () => {
    const backend = { appType: "backend", type: "backend", healthCheckPath: "/health", port: 4011 };
    const projectRoot = createTempProject({
      projectJson: verifyProject("verify-dockerfile-port-text"),
      stacks: { shop: { api: backend } },
      files: {
        "services/shop/api/Dockerfile":
          "ENV PORT=4010\nEXPOSE 4010\nHEALTHCHECK CMD bun -e \"fetch('http://localhost:4010/health')\"\n",
      },
    });

    const result = runFlisk(["config", "verify"], { cwd: projectRoot });

    expect(result.status).toBe(1);
    const text = `${result.stdout}\n${result.stderr}`;
    expect(text).toContain("4011");
    expect(text).toContain("4010");
    expect(text).toContain("services/shop/api/Dockerfile");
  }, 120_000);
});
