// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runTdk, runTdkAllowFailure } from "./project-e2e-helpers.js";

describe("resource scaffold E2E", () => {
  let projectRoot = "";

  afterEach(() => {
    if (projectRoot?.startsWith(tmpdir())) {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("scaffolds a backend that `flisk doctor` has nothing to say about, with the health route under the key the engine reads", () => {
    projectRoot = mkdtempSync(join(tmpdir(), "tdk-project-healthpath-"));
    runTdk(["project", "--yes"], projectRoot);
    for (const [name, type] of [
      ["fresh-api", "backend"],
      ["fresh-mcp", "mcp"],
    ] as const) {
      runTdk(["resource", name, "--type", type, "--stack", "app", "--yes"], projectRoot);
      const service = JSON.parse(
        readFileSync(join(projectRoot, "services", "app", name, "service.json"), "utf-8"),
      );
      // The engine reads healthCheckPath (default /health). A top-level `healthCheck` is read by nothing.
      expect(service.healthCheckPath, `${name} healthCheckPath`).toBe("/health");
      expect(service, `${name} must not carry the unread healthCheck key`).not.toHaveProperty(
        "healthCheck",
      );
      // The same for the dependency list: `dependencies` is the deprecated name, so a fresh scaffold must not trip its own warning.
      expect(service.dependsOn, `${name} dependsOn`).toEqual([]);
      expect(service, `${name} must not carry the deprecated dependencies key`).not.toHaveProperty(
        "dependencies",
      );
    }

    const output = runTdkAllowFailure(["doctor"], projectRoot);
    expect(output).not.toMatch(/service\.json\.healthCheck: unknown field/);
    // Nothing about the scaffold itself: no deprecation and no unknown field for either fresh resource.
    expect(output).not.toMatch(
      /fresh-(api|mcp)\/service\.json\.[A-Za-z]+: (deprecated|unknown field)/,
    );
  }, 120000);

  it("calls a deprecated service.json field deprecated, not unknown, in `flisk doctor`", () => {
    projectRoot = mkdtempSync(join(tmpdir(), "tdk-project-deprecated-"));
    runTdk(["project", "--yes"], projectRoot);
    runTdk(["resource", "dep-api", "--type", "backend", "--stack", "app", "--yes"], projectRoot);
    const servicePath = join(projectRoot, "services", "app", "dep-api", "service.json");
    const service = JSON.parse(readFileSync(servicePath, "utf-8"));
    service.envVars = { LOG_LEVEL: "debug" };
    service.dependencies = ["other"];
    writeFileSync(servicePath, JSON.stringify(service, null, 2));

    const output = runTdkAllowFailure(["doctor"], projectRoot);
    expect(output).toContain("service.json.envVars: deprecated, use params");
    expect(output).toContain("service.json.dependencies: deprecated, use dependsOn");
    // A deprecation is not an unknown field, and the message must not claim it is.
    expect(output).not.toMatch(/Unknown service\.json field: [^\n]*envVars/);
    expect(output).not.toMatch(/Unknown service\.json field: [^\n]*dependencies/);
  }, 90000);
});
