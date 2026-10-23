// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { copyProject, runTdk, runTdkAllowFailure, starlarkSection } from "./project-e2e-helpers.js";

describe("project assets and Verdaccio E2E", () => {
  // One generated project per file. Each test copies it, so only the scaffold runs once.
  let baseRoot = "";
  let projectRoot = "";

  beforeAll(() => {
    baseRoot = mkdtempSync(join(tmpdir(), "tdk-project-base-"));
    runTdk(["project", "--yes"], baseRoot);
  }, 120_000);

  afterAll(() => {
    if (baseRoot.startsWith(tmpdir())) {
      rmSync(baseRoot, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (projectRoot?.startsWith(tmpdir())) {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("does not require Verdaccio for `flisk doctor`'s environment check", () => {
    projectRoot = copyProject(baseRoot);
    writeFileSync(
      join(projectRoot, ".env"),
      "TILT_ENV=dev\nDB_PASSWORD=0123456789abcdef0123456789abcdef\n",
    );

    const output = runTdkAllowFailure(["doctor"], projectRoot);
    expect(output).not.toMatch(/Missing required env variables/);
    expect(output).not.toContain("VERDACCIO_URL_DOCKER");
  }, 60000);

  it("keeps Verdaccio as an explicit premium project feature", () => {
    projectRoot = copyProject(baseRoot);

    const projectJsonPath = join(projectRoot, ".tdk", "project.json");
    const projectJson = JSON.parse(readFileSync(projectJsonPath, "utf-8"));
    expect(projectJson.phases.pre_alpha.enabledStacks).not.toContain("verdaccio");
    expect(projectJson.optional_infra.verdaccio).toBe(false);

    let spec = readFileSync(join(projectRoot, ".tdk", ".tdk-out", "spec.master"), "utf-8");
    expect(starlarkSection(spec, "PRE_ALPHA_RESOURCES")).not.toContain('"verdaccio": True');
    expect(starlarkSection(spec, "OPTIONAL_INFRA_RESOURCES")).toContain('"verdaccio": False');

    // Without TDK_LICENSE_KEY granting it, enabling verdaccio must be refused
    // outright (config.ts:toggleInfraService) rather than silently accepted
    // and then downgraded back to false by generateMasterConfigs.
    expect(() => runTdk(["config", "enable-infra", "verdaccio"], projectRoot)).toThrow(
      /Premium feature/,
    );

    const updatedProjectJson = JSON.parse(readFileSync(projectJsonPath, "utf-8"));
    expect(updatedProjectJson.phases.pre_alpha.enabledStacks).not.toContain("verdaccio");
    expect(updatedProjectJson.optional_infra.verdaccio).toBe(false);

    spec = readFileSync(join(projectRoot, ".tdk", ".tdk-out", "spec.master"), "utf-8");
    expect(starlarkSection(spec, "PRE_ALPHA_RESOURCES")).not.toContain('"verdaccio": True');
    expect(starlarkSection(spec, "OPTIONAL_INFRA_RESOURCES")).toContain('"verdaccio": False');
  }, 30000);

  it("warns instead of silently stripping stale Verdaccio state when no premium license grants it", () => {
    // generateMasterConfigs() intentionally does not enforce the license
    // gate itself (see the comment above hasVerdaccioLicense's call site in
    // template-engine.ts): the real enforcement is that the free-tier
    // verdaccio_loader.star in this public repo is a no-op stub, so hand-
    // edited state here has no functional effect without the private
    // premium overlay. It just warns so the user isn't left guessing.
    projectRoot = copyProject(baseRoot);

    const projectJsonPath = join(projectRoot, ".tdk", "project.json");
    const projectJson = JSON.parse(readFileSync(projectJsonPath, "utf-8"));
    projectJson.phases.pre_alpha.enabledStacks.push("verdaccio");
    projectJson.optional_infra.verdaccio = true;
    writeFileSync(projectJsonPath, JSON.stringify(projectJson, null, 2));

    runTdk(["config", "regenerate"], projectRoot);

    const updatedProjectJson = JSON.parse(readFileSync(projectJsonPath, "utf-8"));
    expect(updatedProjectJson.phases.pre_alpha.enabledStacks).toContain("verdaccio");
    expect(updatedProjectJson.optional_infra.verdaccio).toBe(true);

    const spec = readFileSync(join(projectRoot, ".tdk", ".tdk-out", "spec.master"), "utf-8");
    expect(starlarkSection(spec, "PRE_ALPHA_RESOURCES")).toContain('"verdaccio": True');
    expect(starlarkSection(spec, "OPTIONAL_INFRA_RESOURCES")).toContain('"verdaccio": True');
  }, 30000);

  it("copies Docker runtime assets and creates the root workspace manifest during project generation", () => {
    projectRoot = copyProject(baseRoot);

    const rootPackageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf-8"));
    expect(rootPackageJson.private).toBe(true);
    expect(rootPackageJson.workspaces).toEqual(["services/*/*"]);

    for (const file of [
      "install-deps.sh",
      "bun-hoisted-symlink-fix.sh",
      "prisma-bun-client-link-fix.sh",
      "prisma-normalize-client.sh",
    ]) {
      expect(
        existsSync(join(projectRoot, "shared-platform-engineering", "docker-templates", file)),
      ).toBe(true);
    }
  }, 10000);

  it("vendors free env injection instead of Infisical credentials by default", () => {
    projectRoot = copyProject(baseRoot);

    const envGenerator = readFileSync(
      join(
        projectRoot,
        ".tdk",
        ".tdk-out",
        "tdk-cli-ext",
        "engine",
        "topologies",
        "platform",
        "docker",
        "secrets",
        "infisical.star",
      ),
      "utf-8",
    );
    expect(envGenerator).toContain("TDK_SECRET_PROVIDER");
    expect(envGenerator).not.toContain("INFISICAL_CLIENT_SECRET");

    const dockerfileGenerator = readFileSync(
      join(
        projectRoot,
        ".tdk",
        ".tdk-out",
        "tdk-cli-ext",
        "engine",
        "topologies",
        "platform",
        "docker",
        "dockerfile",
        "dockerfile.star",
      ),
      "utf-8",
    );
    expect(dockerfileGenerator).toContain("use_infisical=False");
  }, 10000);

  it("writes default resource-level features into generated service.json files", () => {
    projectRoot = copyProject(baseRoot);

    runTdk(
      ["resource", "api", "--type", "backend", "--stack", "alpha", "--path", "services/alpha/api"],
      projectRoot,
      "\n",
    );
    runTdk(
      ["resource", "web", "--type", "frontend", "--stack", "alpha", "--path", "services/alpha/web"],
      projectRoot,
      "\n",
    );

    const backendService = JSON.parse(
      readFileSync(join(projectRoot, "services", "alpha", "api", "service.json"), "utf-8"),
    );
    // No prisma by default: `flisk resource` creates no prisma/schema.prisma or dependency, so
    // enabling it made the generated Dockerfile fail on `COPY .../prisma` for every new backend.
    expect(backendService.featuresEnabled).toEqual([]);

    const frontendService = JSON.parse(
      readFileSync(join(projectRoot, "services", "alpha", "web", "service.json"), "utf-8"),
    );
    expect(frontendService.featuresEnabled).toEqual(["api-client", "env-config", "api-index"]);
  }, 30000);
});
