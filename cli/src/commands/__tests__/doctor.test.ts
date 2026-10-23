// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureExit } from "../../test-support/index.js";
import type { CheckResult } from "../../types/index.js";
import { CONTAINER_RUNTIME_CHECK, STANDARD_PORTS } from "../../utils/constants.js";
import {
  checkHostPorts,
  checkIngressPorts,
  checkPrivateNpmRegistry,
  checkTiltResourceHealth,
  findForeignIngressHolders,
  HOST_PORT_FIXES,
  orderTiltFailures,
  parsePublishedPortHolders,
  parseTiltResourceFailures,
  probeContainerRuntimeError,
  summarizeTiltBuildError,
} from "../../utils/doctor-runtime.js";
import { checkSharedStackRoutes } from "../../utils/doctor-wiring.js";
import {
  checkWindowsDockerMode,
  checkWindowsHostConfiguration,
  checkWindowsRuntimeTools,
} from "../../utils/windows-doctor.js";
import {
  checkDockerCompose,
  checkDockerVersions,
  checkFrontendDockerPreflight,
  checkGeneratedProjectRuntimeAssets,
  checkResourceDiscovery,
  checkStarlarkLoadExports,
  checkTdkVersion,
  checkTypeScriptTypeDependencies,
  DOCTOR_FIXES,
  doctorCommand,
  formatDoctorSummary,
  getDoctorOutcomeMessage,
  NATIVE_WINDOWS_DOCTOR_MESSAGE,
  renderDoctorOutput,
  requiresContainerRuntime,
  runChecks,
  WSL2_DOCTOR_MESSAGE,
} from "../doctor.js";

vi.mock("../../utils/windows-doctor.js", () => ({
  checkWindowsRuntimeTools: vi.fn(() => ({
    name: "Windows Runtime Tools",
    didPass: true,
    message:
      "Docker (docker.exe) and Tilt found on PATH; Bun was not found (generated services need Bun)",
  })),
  checkWindowsDockerMode: vi.fn(() => ({
    name: "Docker container mode",
    didPass: false,
    message:
      "Docker Desktop is using Windows containers. Switch to Linux containers. Flisk stacks are Linux images.",
    fix: "Switch Docker Desktop to Linux containers. Flisk does not run Windows containers.",
  })),
  checkWindowsHostConfiguration: vi.fn(async () => ({
    name: "Windows ports and DNS",
    didPass: false,
    message:
      "⚠️ Windows reserved port 80 for Hyper-V/WSL. Fix: disable the conflicting Windows feature or change Flisk ports in project config.\nWindows did not resolve *.tdk.localhost to 127.0.0.1. Browser URLs with hostnames will fail until you fix hosts or use the 127.0.0.1 URLs printed by flisk networks.\ngit core.autocrlf is true; generated files may get CRLF while Docker Linux containers expect LF. Recommended: git config core.autocrlf input in Flisk repos.\nDocker Desktop Settings → Resources → File sharing must include this project directory.",
    fix: "Windows did not resolve *.tdk.localhost to 127.0.0.1. Browser URLs with hostnames will fail until you fix hosts or use the 127.0.0.1 URLs printed by flisk networks.",
  })),
}));

describe("doctor exact guidance", () => {
  it("keeps prerequisite fixes as the specified copy-paste text", () => {
    expect(DOCTOR_FIXES).toEqual({
      dockerMissing: "See https://docs.docker.com/get-docker/",
      dockerDaemonDown: "Start Docker Desktop, OrbStack, or Colima, then retry: flisk doctor",
      tiltMissing:
        "curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash",
      bunMissing: "curl -fsSL https://bun.sh/install | bash",
      port80: "Stop the process bound to port 80, or stop local nginx/caddy. Then: flisk doctor",
      port5432: "Stop local Postgres or change the host port. Then: flisk doctor",
      notProject: "flisk project --yes",
    });
    expect(WSL2_DOCTOR_MESSAGE).toBe(
      "WSL2 detected. Use Docker Desktop WSL integration. Guide: docs/wsl2.md",
    );
  });

  it("prints exact project-aware final outcomes", () => {
    expect(getDoctorOutcomeMessage(false, true)).toBe("Doctor passed. Next: flisk project example");
    expect(getDoctorOutcomeMessage(true, true)).toBe("Doctor passed. Next: flisk up");
    expect(getDoctorOutcomeMessage(true, false)).toBe(
      "Doctor failed. Fix the items above, then run: flisk doctor",
    );
  });

  it("uses exact remediation copy for ports 80 and 5432", async () => {
    const port80 = await checkHostPorts((() => "") as never, "tdk-project", async (port) =>
      port === 80 ? "in-use" : "free",
    );
    const port5432 = await checkHostPorts((() => "") as never, "tdk-project", async (port) =>
      port === 5432 ? "in-use" : "free",
    );

    expect(port80.fix).toBe(HOST_PORT_FIXES.port80);
    expect(port5432.fix).toBe(HOST_PORT_FIXES.port5432);
  });
});

describe("doctor frontend Docker preflight", () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = join(
      tmpdir(),
      `flisk-doctor-frontend-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function writeFrontendProject(options: {
    composePort: number;
    dockerTsconfig: Record<string, unknown>;
    mainTsx: string;
  }) {
    const appDir = join(testDir, "services", "app", "dashboard-app");
    const generatedDir = join(appDir, ".autogenerated");
    const stackGeneratedDir = join(testDir, "services", "app", ".autogenerated");

    mkdirSync(generatedDir, { recursive: true });
    mkdirSync(stackGeneratedDir, { recursive: true });
    mkdirSync(join(appDir, "src"), { recursive: true });
    mkdirSync(join(appDir, "public"), { recursive: true });

    writeFileSync(
      join(appDir, "service.json"),
      JSON.stringify(
        {
          appName: "dashboard-app",
          appType: "frontend",
          stack: "app",
          port: 3200,
          basePath: "/dashboard-app",
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(generatedDir, "Dockerfile.app.autogenerated"),
      "FROM nginx:alpine\nCOPY dist /usr/share/nginx/html\nEXPOSE 80\n",
    );
    writeFileSync(
      join(stackGeneratedDir, "docker-compose.app.autogenerated.yml"),
      [
        "services:",
        "  dashboard-app:",
        "    labels:",
        `      - "traefik.http.services.dashboard-app.loadbalancer.server.port=${options.composePort}"`,
      ].join("\n"),
    );
    writeFileSync(
      join(generatedDir, "tsconfig.docker.autogenerated.json"),
      JSON.stringify(options.dockerTsconfig, null, 2),
    );
    writeFileSync(join(appDir, "src", "main.tsx"), options.mainTsx);
  }

  it("fails when generated Traefik routes an nginx frontend to the Vite dev port", () => {
    writeFrontendProject({
      composePort: 3200,
      dockerTsconfig: { compilerOptions: { allowSyntheticDefaultImports: true } },
      mainTsx: 'import { StrictMode } from "react";\n',
    });

    const result = checkFrontendDockerPreflight();

    expect(result.didPass).toBe(false);
    expect(result.message).toContain("nginx runtime exposes 80");
    expect(result.message).toContain("routes to 3200");
  });

  it("fails when Docker tsconfig rejects default React imports used by the entrypoint", () => {
    writeFrontendProject({
      composePort: 80,
      dockerTsconfig: { compilerOptions: { strict: true } },
      mainTsx: ['import React from "react";', 'import ReactDOM from "react-dom/client";', ""].join(
        "\n",
      ),
    });

    const result = checkFrontendDockerPreflight();

    expect(result.didPass).toBe(false);
    expect(result.message).toContain("does not allow synthetic default imports");
    expect(result.message).toContain("react-dom/client");
  });

  it("fails when a frontend has no public/ folder for the Docker build to copy", () => {
    writeFrontendProject({
      composePort: 80,
      dockerTsconfig: { compilerOptions: { strict: true } },
      mainTsx: "",
    });
    rmSync(join(testDir, "services", "app", "dashboard-app", "public"), { recursive: true });

    const result = checkFrontendDockerPreflight();

    expect(result.didPass).toBe(false);
    expect(result.message).toContain("dashboard-app: no public/ folder");
    expect(result.message).toContain("mkdir -p services/app/dashboard-app/public");
  });

  it("passes when generated frontend Docker metadata is internally consistent", () => {
    writeFrontendProject({
      composePort: 80,
      dockerTsconfig: { compilerOptions: { strict: true } },
      mainTsx: [
        'import { StrictMode } from "react";',
        'import { createRoot } from "react-dom/client";',
        "",
      ].join("\n"),
    });

    const result = checkFrontendDockerPreflight();

    expect(result.didPass).toBe(true);
  });

  it("fails when generated Starlark loads a private exported symbol", () => {
    const outDir = join(testDir, ".tdk", ".tdk-out");
    const extDir = join(outDir, "tdk-cli-ext", "engine");
    mkdirSync(extDir, { recursive: true });
    writeFileSync(join(outDir, "Tiltfile"), 'load("./tdk-cli-ext/engine/bad.star", "Bad")\n');
    writeFileSync(
      join(extDir, "sablier_container_cycle.star"),
      "_sablier_middleware_suffix = 'x'\n",
    );
    writeFileSync(join(extDir, "public.star"), "Docker = struct()\n");
    writeFileSync(
      join(extDir, "bad.star"),
      [
        "Bad = struct()",
        'load("./sablier_container_cycle.star", "_sablier_middleware_suffix")',
        'load("./public.star", _Docker = "Docker")',
        "",
      ].join("\n"),
    );

    const result = checkStarlarkLoadExports();

    expect(result.didPass).toBe(false);
    expect(result.message).toContain("_sablier_middleware_suffix");
    expect(result.message).not.toContain("_Docker");
  });

  it("fails when generated Starlark loads a missing relative file", () => {
    const outDir = join(testDir, ".tdk", ".tdk-out");
    const extDir = join(outDir, "tdk-cli-ext", "discovery");
    mkdirSync(extDir, { recursive: true });
    writeFileSync(
      join(outDir, "Tiltfile"),
      'load("./tdk-cli-ext/discovery/daemon.star", "Daemon")\n',
    );
    writeFileSync(join(extDir, "daemon.star"), 'load("./resource_registry.star", "CacheOps")\n');

    const result = checkStarlarkLoadExports();

    expect(result.didPass).toBe(false);
    expect(result.message).toContain("Missing relative load targets");
    expect(result.message).toContain("resource_registry.star");
  });

  it("passes when generated Starlark only uses private local aliases", () => {
    const extDir = join(testDir, ".tdk", ".tdk-out", "tdk-cli-ext", "engine");
    mkdirSync(extDir, { recursive: true });
    writeFileSync(join(extDir, "public.star"), "Docker = struct()\n");
    writeFileSync(join(extDir, "good.star"), 'load("./public.star", _Docker = "Docker")\n');

    const result = checkStarlarkLoadExports();

    expect(result.didPass).toBe(true);
  });
});

describe("doctor generated runtime asset preflight", () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = join(
      tmpdir(),
      `flisk-doctor-runtime-assets-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    mkdirSync(join(testDir, ".tdk"), { recursive: true });
    writeFileSync(
      join(testDir, ".tdk", "project.json"),
      JSON.stringify({
        version: "1.0",
        project: { name: "asset-check", version: "1.0.0" },
        phases: {
          pre_alpha: { name: "Pre-Alpha", description: "", enabledStacks: [] },
          alpha: { name: "Alpha", description: "", enabledStacks: [] },
          beta: { name: "Beta", description: "", enabledStacks: [] },
          out_of_scope: { name: "Out of Scope", description: "", enabledStacks: [] },
        },
        optional_infra: {
          monitoring: false,
          elk: false,
          debezium: false,
          golden_image: true,
          verdaccio: false,
        },
        discovery: { paths: ["services/*/*"] },
        overrides: {},
      }),
    );
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function writeRequiredRuntimeAssets() {
    const templateDir = join(testDir, "shared-platform-engineering", "docker-templates");
    mkdirSync(templateDir, { recursive: true });
    for (const file of [
      "install-deps.sh",
      "bun-hoisted-symlink-fix.sh",
      "prisma-bun-client-link-fix.sh",
      "prisma-normalize-client.sh",
      "infisical-entrypoint.sh",
    ]) {
      writeFileSync(join(templateDir, file), "#!/bin/sh\n");
    }
  }

  it("fails when the root workspace package.json and Docker template scripts are missing", () => {
    const result = checkGeneratedProjectRuntimeAssets();

    expect(result.didPass).toBe(false);
    expect(result.message).toContain("package.json");
    expect(result.message).toContain("install-deps.sh");
    expect(result.fix).toContain("flisk project");
  });

  it("passes when generated Docker runtime assets are present", () => {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({ name: "asset-check", private: true, workspaces: ["services/*/*"] }),
    );
    writeRequiredRuntimeAssets();

    const result = checkGeneratedProjectRuntimeAssets();

    expect(result.didPass).toBe(true);
    expect(result.message).toContain("runtime assets are present");
  });

  it("flags a script a generated Dockerfile copies but the project lacks", () => {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({ name: "asset-check", private: true, workspaces: ["services/*/*"] }),
    );
    writeRequiredRuntimeAssets();
    const serviceDir = join(testDir, "services", "shop", "orders-api");
    mkdirSync(join(serviceDir, ".autogenerated"), { recursive: true });
    writeFileSync(
      join(serviceDir, "service.json"),
      JSON.stringify({ appName: "orders-api", appType: "backend", stack: "shop", port: 4000 }),
    );
    writeFileSync(
      join(serviceDir, ".autogenerated", "Dockerfile.app.autogenerated"),
      "COPY shared-platform-engineering/docker-templates/migrate.sh /usr/local/bin/migrate.sh\n",
    );

    const result = checkGeneratedProjectRuntimeAssets();

    expect(result.didPass).toBe(false);
    expect(result.message).toContain("migrate.sh");
  });
});

describe("doctor TypeScript type dependency check", () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = join(
      tmpdir(),
      `flisk-doctor-types-bun-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function writeBackendResource(
    devDependencies: Record<string, string>,
    types: string[] = ["bun"],
    dependencies: Record<string, string> = {},
    scripts: Record<string, string> = { build: "tsc" },
  ) {
    const appDir = join(testDir, "services", "finance", "cash-management-api");
    const generatedDir = join(appDir, ".autogenerated");
    mkdirSync(generatedDir, { recursive: true });

    writeFileSync(
      join(appDir, "service.json"),
      JSON.stringify(
        {
          appName: "cash-management-api",
          appType: "backend",
          stack: "finance",
          port: 4000,
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(appDir, "package.json"),
      JSON.stringify(
        { name: "cash-management-api", scripts, dependencies, devDependencies },
        null,
        2,
      ),
    );
    writeFileSync(
      join(generatedDir, "tsconfig.docker.autogenerated.json"),
      JSON.stringify({ compilerOptions: { types } }, null, 2),
    );
  }

  it('fails when a service\'s tsconfig sets "types": ["bun"] but @types/bun is not a devDependency', () => {
    writeBackendResource({ typescript: "^5.0.0" });

    const result = checkTypeScriptTypeDependencies();

    expect(result.didPass).toBe(false);
    expect(result.message).toContain("cash-management-api");
    expect(result.message).toContain("@types/bun");
    expect(result.fix).toContain('"@types/bun"');
  });

  it('passes when @types/bun and @types/node are devDependencies alongside "types": ["bun"]', () => {
    writeBackendResource({
      typescript: "^5.0.0",
      "@types/bun": "^1.4.2",
      "@types/node": "^20.0.0",
    });

    const result = checkTypeScriptTypeDependencies();

    expect(result.didPass).toBe(true);
  });

  it('fails when "types": ["node"] has no @types/node (the case a fresh scaffold hit)', () => {
    // The engine's Docker tsconfig lists "node"; a scaffold without @types/node failed the
    // image build with TS2688, and this check only looked at "bun", so doctor said all clear.
    writeBackendResource({ typescript: "^7.0.0", "@types/bun": "^1.4.2" }, ["node"]);

    const result = checkTypeScriptTypeDependencies();

    expect(result.didPass).toBe(false);
    expect(result.message).toContain(
      'cash-management-api: "types" lists "node" (needs @types/node)',
    );
    expect(result.message).toContain("TS2688");
    expect(result.fix).toContain('"@types/node": "^20.0.0"');
  });

  it('passes when @types/node is present for "types": ["node"]', () => {
    writeBackendResource({ "@types/node": "^20.0.0" }, ["node"]);
    expect(checkTypeScriptTypeDependencies().didPass).toBe(true);
  });

  it("reports only the entries that are missing when several are listed", () => {
    writeBackendResource({ "@types/bun": "^1.4.2" }, ["bun", "node"]);

    const result = checkTypeScriptTypeDependencies();

    expect(result.didPass).toBe(false);
    expect(result.message).toContain('"node"');
    expect(result.message).not.toContain('"bun"');
  });

  it("accepts a type package listed under dependencies, not just devDependencies", () => {
    writeBackendResource({}, ["node"], { "@types/node": "^20.0.0" });
    expect(checkTypeScriptTypeDependencies().didPass).toBe(true);
  });

  it("does not flag a service whose build is vite build, which never reads tsconfig types", () => {
    // The ERP frontends: types ["node"] in the Docker tsconfig, no @types/node, and they build
    // fine because `vite build` only transpiles. Flagging them told a working project it was broken.
    writeBackendResource({}, ["node"], {}, { build: "vite build", typecheck: "tsc --noEmit" });
    expect(checkTypeScriptTypeDependencies().didPass).toBe(true);
  });

  it("flags a frontend whose build runs tsc before vite", () => {
    writeBackendResource({}, ["node"], {}, { build: "tsc && vite build" });
    expect(checkTypeScriptTypeDependencies().didPass).toBe(false);
  });

  it("follows a build script that runs another script which runs tsc", () => {
    writeBackendResource({}, ["node"], {}, { build: "bun run compile", compile: "bunx tsc -p ." });
    expect(checkTypeScriptTypeDependencies().didPass).toBe(false);
  });

  it("skips a service with no build script", () => {
    writeBackendResource({}, ["node"], {}, {});
    expect(checkTypeScriptTypeDependencies().didPass).toBe(true);
  });

  it("does not loop forever on scripts that run each other", () => {
    writeBackendResource({}, ["node"], {}, { build: "bun run a", a: "bun run build" });
    expect(checkTypeScriptTypeDependencies().didPass).toBe(true);
  });

  it("fails when @types/bun is used but @types/node is not a direct dependency (bun-types' hidden reference)", () => {
    // bun-types hardcodes `/// <reference types="node" />` in its own index.d.ts.
    // TypeScript honors that regardless of the tsconfig's "types" restriction, so
    // "types": ["bun"] alone is not enough -- @types/node must resolve too. It can
    // resolve transitively via bun-types' own dependency, but that hoisting is not
    // guaranteed in Docker's isolated per-service install, unlike a full workspace
    // install, so the same service can build locally and fail with TS2688 in Docker.
    writeBackendResource({ typescript: "^5.0.0", "@types/bun": "^1.4.2" });

    const result = checkTypeScriptTypeDependencies();

    expect(result.didPass).toBe(false);
    expect(result.message).toContain("cash-management-api");
    expect(result.message).toContain("@types/bun");
    expect(result.message).toContain("node types internally");
    expect(result.fix).toContain('"@types/node"');
  });

  it("passes when @types/bun and @types/node are both direct dependencies", () => {
    writeBackendResource({
      typescript: "^5.0.0",
      "@types/bun": "^1.4.2",
      "@types/node": "^20.0.0",
    });
    expect(checkTypeScriptTypeDependencies().didPass).toBe(true);
  });

  it("does not require @types/node when @types/bun is unused", () => {
    writeBackendResource({ "@types/node": "^20.0.0" }, ["node"]);
    expect(checkTypeScriptTypeDependencies().didPass).toBe(true);
  });

  it("catches the hidden @types/node requirement even when @types/bun is a dependency without being in the types array", () => {
    // "types" only lists what the tsconfig explicitly restricts resolution to; a
    // service can still have @types/bun installed (and hit its reference) without
    // "bun" appearing there.
    writeBackendResource({ "@types/bun": "^1.4.2" }, []);

    const result = checkTypeScriptTypeDependencies();

    expect(result.didPass).toBe(false);
    expect(result.message).toContain("node types internally");
  });

  it("resolves subpath and scoped entries to the package that provides them", () => {
    writeBackendResource({ vitest: "^5.0.0", "@cloudflare/workers-types": "^4.0.0" }, [
      "vitest/globals",
      "@cloudflare/workers-types/2023-07-01",
    ]);
    expect(checkTypeScriptTypeDependencies().didPass).toBe(true);

    const missing = (() => {
      writeBackendResource({}, ["vitest/globals"]);
      return checkTypeScriptTypeDependencies();
    })();
    expect(missing.didPass).toBe(false);
    expect(missing.message).toContain('"vitest/globals" (needs vitest)');
  });
});

describe("doctor ingress + tilt runtime checks", () => {
  it("detects a foreign Traefik holding host port 80", () => {
    const dockerPs = [
      "tdk_saas_starter_traefik\t0.0.0.0:80->80/tcp,:::80->80/tcp,0.0.0.0:8080->8080/tcp",
      "tdk_project_postgres\t0.0.0.0:5432->5432/tcp",
    ].join("\n");

    const holders = parsePublishedPortHolders(dockerPs, [80, 443]);
    expect(holders).toHaveLength(1);
    expect(holders[0]?.name).toBe("tdk_saas_starter_traefik");
    expect(holders[0]?.publishedPorts).toContain(80);

    const foreign = findForeignIngressHolders(holders, "tdk_project");
    expect(foreign).toHaveLength(1);

    const result = checkIngressPorts((() => dockerPs) as never, "tdk-project");
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("tdk_saas_starter_traefik");
    expect(result.fix).toContain("docker stop");
  });

  it("passes when this project's Traefik owns the ingress ports", () => {
    const dockerPs = "tdk_project_traefik\t0.0.0.0:80->80/tcp,:::80->80/tcp,0.0.0.0:443->443/tcp";
    const result = checkIngressPorts((() => dockerPs) as never, "tdk-project");
    expect(result.didPass).toBe(true);
    expect(result.message).toContain("tdk_project_traefik");
  });

  it("fails doctor when Tilt reports Traefik update errors that block apps", () => {
    const payload = {
      items: [
        {
          metadata: { name: "traefik" },
          status: {
            updateStatus: "error",
            runtimeStatus: "unknown",
            buildHistory: [
              {
                error:
                  "Bind for 0.0.0.0:80 failed: port is already allocated\nerror: exit status 1",
              },
            ],
          },
        },
        {
          metadata: { name: "salon-management-frontend" },
          status: { updateStatus: "pending", runtimeStatus: "pending" },
        },
        {
          metadata: { name: "postgres" },
          status: { updateStatus: "ok", runtimeStatus: "ok" },
        },
      ],
    };

    const parsed = parseTiltResourceFailures(JSON.stringify(payload));
    expect(parsed.failures).toHaveLength(1);
    expect(parsed.failures[0]?.name).toBe("traefik");
    expect(parsed.pendingCount).toBe(1);

    const result = checkTiltResourceHealth((() => JSON.stringify(payload)) as never);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("traefik");
    expect(result.message).toContain("port 80");
    expect(result.message).toContain("pending");
    expect(result.fix).toMatch(/docker ps --filter publish=80|Free the conflicting/);
  });

  it("points to the URL printed by flisk up when Tilt resources fail", () => {
    const payload = {
      items: [
        {
          metadata: { name: "api" },
          status: { updateStatus: "error", runtimeStatus: "unknown" },
        },
      ],
    };

    const originalProcess = process;
    vi.stubGlobal(
      "process",
      new Proxy(originalProcess, {
        get(target, property) {
          if (property === "platform") return "linux";
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
    );

    try {
      const result = checkTiltResourceHealth(((command: string) => {
        if (command.includes("tilt get uiresources -o json")) return JSON.stringify(payload);
        return "";
      }) as never);

      expect(result.didPass).toBe(false);
      expect(result.fix).toContain("Open the Tilt UI URL printed by flisk up");
      expect(result.fix).toContain(`default port ${STANDARD_PORTS.tiltUi} when TILT_PORT is unset`);
      expect(result.fix).not.toContain("localhost:10350");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("separates sablier.deferStart resources from genuinely pending ones", () => {
    const payload = {
      items: [
        {
          metadata: { name: "data-governance-api" },
          status: { updateStatus: "none", runtimeStatus: "none" },
        },
        {
          metadata: { name: "some-other-stuck-resource" },
          status: { updateStatus: "pending", runtimeStatus: "pending" },
        },
        {
          metadata: { name: "postgres" },
          status: { updateStatus: "ok", runtimeStatus: "ok" },
        },
      ],
    };

    const parsed = parseTiltResourceFailures(
      JSON.stringify(payload),
      new Set(["data-governance-api"]),
    );
    expect(parsed.failures).toHaveLength(0);
    expect(parsed.deferredCount).toBe(1);
    expect(parsed.pendingCount).toBe(1);

    const result = checkTiltResourceHealth((() => JSON.stringify(payload)) as never);
    expect(result.didPass).toBe(true);
    // Without an injected deferredNames set (checkTiltResourceHealth computes
    // its own via discoverResources(), best-effort empty outside a project),
    // this specific resource isn't classified as deferred here -- covered by
    // the direct parseTiltResourceFailures assertions above instead.
  });

  it("does not describe deferred resources as blocked by unrelated failures", () => {
    const payload = {
      items: [
        {
          metadata: { name: "traefik" },
          status: {
            updateStatus: "error",
            runtimeStatus: "unknown",
            buildHistory: [{ error: "Bind for 0.0.0.0:80 failed: port is already allocated" }],
          },
        },
        {
          metadata: { name: "data-governance-api" },
          status: { updateStatus: "none", runtimeStatus: "none" },
        },
      ],
    };

    const parsed = parseTiltResourceFailures(
      JSON.stringify(payload),
      new Set(["data-governance-api"]),
    );
    expect(parsed.deferredCount).toBe(1);
    expect(parsed.pendingCount).toBe(0);
  });

  it("skips tilt resource check when tilt is not running", () => {
    const result = checkTiltResourceHealth((() => {
      throw new Error("tilt not running");
    }) as never);
    expect(result.isSkipped).toBe(true);
    expect(result.didPass).toBe(true);
  });

  it("summarizes ConnectionRefused package manifest errors from build logs", () => {
    const raw = [
      "error: ConnectionRefused downloading package manifest @flisk-sh/eventing",
      "error: ConnectionRefused downloading package manifest @flisk-sh/identity-js-sdk",
      "error: ConnectionRefused downloading package manifest @flisk-sh/observability",
      'ImageBuild: process "/bin/sh -c bun install --production --cache-dir=/cache/bun" did not complete successfully: exit code: 1',
    ].join("\n");

    const summary = summarizeTiltBuildError(raw);
    expect(summary).toContain("ConnectionRefused");
    expect(summary).toContain("@flisk-sh/eventing");
    expect(summary).toContain("Verdaccio");
  });

  it("summarizes truncated bun install ImageBuild exits as registry failures", () => {
    const summary = summarizeTiltBuildError(
      'ImageBuild: process "/bin/sh -c bun install --production --cache-dir=/cache/bun" did not complete successfully: exit code: 1',
    );
    expect(summary).toMatch(/dependency install failed|Verdaccio|ConnectionRefused/i);
  });

  it("summarizes missing compose images for run-only resources", () => {
    const summary = summarizeTiltBuildError(
      'Command "docker compose -p appointment-planner-autogenerated -f .../docker-compose.app.autogenerated.yml up -d --no-build appointment-planner-builder-backend" failed: exit status 1',
    );
    expect(summary).toContain("appointment-planner-builder-backend");
    expect(summary).toMatch(/image is missing|ImageBuild|run-only/i);
  });

  it("lists every failed resource even when an infra resource also failed", () => {
    const payload = {
      items: [
        {
          metadata: { name: "nats-http-bridge" },
          status: { updateStatus: "ok", runtimeStatus: "error" },
        },
        {
          metadata: { name: "appointment-management-backend" },
          status: {
            updateStatus: "error",
            runtimeStatus: "unknown",
            buildHistory: [
              {
                error:
                  'ImageBuild: process "/bin/sh -c bun run build" did not complete successfully: exit code: 1',
              },
            ],
          },
        },
        {
          metadata: { name: "appointment-management-backend-run-only" },
          status: {
            updateStatus: "error",
            runtimeStatus: "not_applicable",
            buildHistory: [
              {
                error:
                  'Command "docker compose -p appointment-autogenerated -f x.yml up -d --no-build appointment-management-backend" failed: exit status 1',
              },
            ],
          },
        },
      ],
    };

    const result = checkTiltResourceHealth(((command: string) => {
      if (command.includes("tilt get uiresources")) {
        return JSON.stringify(payload);
      }
      if (command.startsWith("docker ps")) {
        return "platform-autogenerated-nats-http-bridge-1\n";
      }
      if (command.includes("docker logs")) {
        return 'error: Failed to start NATS HTTP Bridge {"error":"Connection error: getaddrinfo ENOTFOUND"}\nInitializing Kafka consumer... {"brokers":["kafka:9092"]}';
      }
      throw new Error(`unexpected exec: ${command}`);
    }) as typeof import("node:child_process").execSync);

    expect(result.didPass).toBe(false);
    expect(result.message).toContain("3 failed resources");
    expect(result.message).toContain("nats-http-bridge");
    expect(result.message).toContain("appointment-management-backend");
    expect(result.message).toContain("appointment-management-backend-run-only");
    expect(result.message).toMatch(/Kafka broker unreachable|kafka:9092/i);
    expect(result.message).toMatch(/bun run build/i);
    expect(result.fix).toMatch(/Kafka/i);
    expect(
      orderTiltFailures(parseTiltResourceFailures(JSON.stringify(payload)).failures)[0]?.name,
    ).toBe("nats-http-bridge");
  });

  it("probes docker logs for Kafka ENOTFOUND runtime crashes", () => {
    const exec = ((command: string) => {
      if (command.startsWith("docker ps")) {
        return "platform-autogenerated-nats-http-bridge-1\n";
      }
      if (command.includes("docker logs")) {
        return "getaddrinfo ENOTFOUND\nbroker kafka:9092\nFailed to start NATS HTTP Bridge";
      }
      return "";
    }) as typeof import("node:child_process").execSync;

    const summary = probeContainerRuntimeError("nats-http-bridge", exec);
    expect(summary).toMatch(/Kafka broker unreachable/);
  });

  it("reads logs from this project's container when another project runs the same stack", () => {
    const logged: string[] = [];
    const exec = ((command: string) => {
      if (command.startsWith("docker ps")) {
        // Listed first, so an unscoped match would pick the other project.
        return [
          "tdk-person-crud-example-people-autogenerated-person-api-1",
          "acme-shop-people-autogenerated-person-api-1",
        ].join("\n");
      }
      if (command.includes("docker logs")) {
        logged.push(command);
        return "getaddrinfo ENOTFOUND\nbroker kafka:9092";
      }
      return "";
    }) as typeof import("node:child_process").execSync;

    probeContainerRuntimeError("person-api", exec, "acme-shop");

    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("acme-shop-people-autogenerated-person-api-1");
    expect(logged[0]).not.toContain("tdk-person-crud-example");
  });

  it("summarizes bun run build ImageBuild failures", () => {
    const summary = summarizeTiltBuildError(
      'ImageBuild: process "/bin/sh -c bun run build" did not complete successfully: exit code: 1',
    );
    expect(summary).toMatch(/bun run build|TypeScript|Tilt/i);
  });

  it("surfaces registry-oriented fix when ImageBuild dependency installs fail", () => {
    const payload = {
      items: [
        {
          metadata: { name: "appointment-management-backend" },
          status: {
            updateStatus: "error",
            runtimeStatus: "unknown",
            buildHistory: [
              {
                error:
                  'ImageBuild: process "/bin/sh -c bun install --production --cache-dir=/cache/bun" did not complete successfully: exit code: 1',
              },
            ],
          },
        },
        {
          metadata: { name: "salon-management-frontend" },
          status: { updateStatus: "pending", runtimeStatus: "pending" },
        },
      ],
    };

    const result = checkTiltResourceHealth((() => JSON.stringify(payload)) as never);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("appointment-management-backend");
    expect(result.message).toMatch(/dependency install failed|Verdaccio|ConnectionRefused/i);
    expect(result.fix).toMatch(/verdaccio:start|publish/i);
  });

  it("fails private registry check when Verdaccio is enabled but unreachable", () => {
    const projectRoot = join(
      tmpdir(),
      `flisk-doctor-registry-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    mkdirSync(join(projectRoot, ".tdk"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".tdk", "project.json"),
      JSON.stringify({
        project: { name: "demo" },
        optional_infra: { verdaccio: true },
        phases: {},
      }),
    );

    const execDown = ((command: string) => {
      if (command.startsWith("docker ps")) {
        return "";
      }
      if (command.includes("curl")) {
        throw new Error("Failed to connect to localhost port 4873");
      }
      return "";
    }) as typeof import("node:child_process").execSync;

    const result = checkPrivateNpmRegistry(execDown, projectRoot, "http://localhost:4873");

    expect(result.didPass).toBe(false);
    expect(result.message).toContain("ConnectionRefused");
    expect(result.fix).toMatch(/verdaccio:start/);

    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("passes private registry check when Verdaccio responds", () => {
    const projectRoot = join(
      tmpdir(),
      `flisk-doctor-registry-ok-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    mkdirSync(join(projectRoot, ".tdk"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".tdk", "project.json"),
      JSON.stringify({
        project: { name: "demo" },
        optional_infra: { verdaccio: true },
        phases: {},
      }),
    );

    const execUp = ((command: string) => {
      if (command.startsWith("docker ps")) {
        return "tdk-project-verdaccio\n";
      }
      if (command.includes("curl")) {
        return "200";
      }
      return "";
    }) as typeof import("node:child_process").execSync;

    const result = checkPrivateNpmRegistry(execUp, projectRoot, "http://localhost:4873");

    expect(result.didPass).toBe(true);
    expect(result.message).toContain("reachable");

    rmSync(projectRoot, { recursive: true, force: true });
  });
});

describe("doctor private registry check without a Verdaccio license", () => {
  function projectWithVerdaccioEnabled(npmrc?: string): string {
    const projectRoot = join(
      tmpdir(),
      `flisk-doctor-registry-unlicensed-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    mkdirSync(join(projectRoot, ".tdk"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".tdk", "project.json"),
      JSON.stringify({
        project: { name: "demo" },
        optional_infra: { verdaccio: true },
        phases: {},
      }),
    );
    if (npmrc) writeFileSync(join(projectRoot, ".npmrc"), npmrc);
    return projectRoot;
  }

  const unreachable = (() => {
    throw new Error("Failed to connect to localhost port 4873");
  }) as unknown as typeof import("node:child_process").execSync;

  it("skips when the config enables Verdaccio but Flisk will not start it", () => {
    const projectRoot = projectWithVerdaccioEnabled();
    const result = checkPrivateNpmRegistry(
      unreachable,
      projectRoot,
      "http://localhost:4873",
      false,
    );
    expect(result.didPass).toBe(true);
    expect(result.isSkipped).toBe(true);
    expect(result.message).toContain("Premium license");
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("still checks a registry the project's own .npmrc points at", () => {
    const projectRoot = projectWithVerdaccioEnabled("@acme:registry=http://localhost:4873\n");
    const result = checkPrivateNpmRegistry(
      unreachable,
      projectRoot,
      "http://localhost:4873",
      false,
    );
    expect(result.didPass).toBe(false);
    rmSync(projectRoot, { recursive: true, force: true });
  });
});

describe("doctor Docker version check", () => {
  function fakeExec(engine: string, compose: string) {
    return (async (command: string) =>
      command.startsWith("docker compose") ? `${compose}\n` : `${engine}\n`) as never;
  }

  it("passes on Docker Engine 25+ and Compose 2.20.2+", async () => {
    const result = await checkDockerVersions(fakeExec("29.8.0", "2.39.1"));

    expect(result.didPass).toBe(true);
    expect(result.isSkipped).toBeFalsy();
    expect(result.message).toContain("29.8.0");
  });

  it("fails with an upgrade hint when the engine is older than 25", async () => {
    const result = await checkDockerVersions(fakeExec("24.0.7", "2.39.1"));

    expect(result.didPass).toBe(false);
    expect(result.message).toContain("Docker Engine 24.0.7");
    expect(result.message).toContain("start_interval");
    expect(result.fix).toContain("Update Docker");
  });

  it("fails when Compose is older than 2.20.2", async () => {
    const result = await checkDockerVersions(fakeExec("27.1.1", "v2.20.1"));

    expect(result.didPass).toBe(false);
    expect(result.message).toContain("Docker Compose v2.20.1");
  });

  it("skips instead of failing when versions cannot be read", async () => {
    const result = await checkDockerVersions((() => {
      throw new Error("docker not found");
    }) as never);

    expect(result.didPass).toBe(true);
    expect(result.isSkipped).toBe(true);
  });
});

describe("doctor resource discovery", () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = join(
      tmpdir(),
      `flisk-doctor-discovery-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    mkdirSync(join(testDir, ".tdk"), { recursive: true });
    writeFileSync(join(testDir, "Tiltfile"), "");
    writeFileSync(
      join(testDir, ".tdk", "project.json"),
      JSON.stringify({ discovery: { paths: ["services/*/*"] } }),
    );
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
  });

  function writeResource(dir: string, appName: string) {
    mkdirSync(join(testDir, dir), { recursive: true });
    writeFileSync(
      join(testDir, dir, "service.json"),
      JSON.stringify({ appName, appType: "frontend", stack: "shop" }),
    );
  }

  it("passes when every resource is under a discovery path", () => {
    writeResource("services/shop/storefront", "storefront");
    expect(checkResourceDiscovery().didPass).toBe(true);
  });

  it("fails and names resources that Tilt would never start", () => {
    writeResource("services/shop/orders-api", "orders-api");
    writeResource("apps/storefront", "storefront");

    const result = checkResourceDiscovery();

    expect(result.didPass).toBe(false);
    expect(result.message).toContain("apps/storefront");
    expect(result.message).not.toContain("orders-api");
    expect(result.fix).toContain("discovery.paths");
  });
});

describe("doctor Flisk version pin", () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = join(
      tmpdir(),
      `flisk-doctor-version-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    mkdirSync(join(testDir, ".tdk"), { recursive: true });
    writeFileSync(join(testDir, "Tiltfile"), "");
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
  });

  function writeProject(config: object) {
    writeFileSync(join(testDir, ".tdk", "project.json"), JSON.stringify(config));
  }

  it("skips when the project sets no minTdkVersion", () => {
    writeProject({});
    const result = checkTdkVersion("1.3.80");
    expect(result.didPass).toBe(true);
    expect(result.isSkipped).toBe(true);
  });

  it("passes when the CLI is at or above the minimum", () => {
    writeProject({ minTdkVersion: "1.3.80" });
    expect(checkTdkVersion("1.3.80").didPass).toBe(true);
    expect(checkTdkVersion("1.4.0").didPass).toBe(true);
  });

  it("fails and says to upgrade when the CLI is older", () => {
    writeProject({ minTdkVersion: "1.3.80" });
    const result = checkTdkVersion("1.3.79");
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("1.3.79");
    expect(result.message).toContain("1.3.80");
    expect(result.fix).toBe("Run: flisk upgrade");
  });

  it("fails on a value that is not MAJOR.MINOR.PATCH", () => {
    writeProject({ minTdkVersion: "latest" });
    const result = checkTdkVersion("1.3.80");
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("minTdkVersion");
  });
});

describe("checkSharedStackRoutes", () => {
  const originalCwd = process.cwd();
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "flisk-doctor-stack-routes-"));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
  });

  function writeResource(name: string, extra: Record<string, unknown> = {}) {
    const dir = join(testDir, "services", "shop", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "service.json"),
      JSON.stringify({ appName: name, appType: "backend", stack: "shop", ...extra }),
    );
  }

  it("passes when each stack has one backend", () => {
    writeResource("orders-api");
    expect(checkSharedStackRoutes(testDir).didPass).toBe(true);
  });

  it("warns, naming both backends, when two share a stack and neither sets a route", () => {
    writeResource("orders-api");
    writeResource("billing-api");

    const result = checkSharedStackRoutes(testDir);

    expect(result.didPass).toBe(false);
    expect(result.isWarning).toBe(true);
    expect(result.message).toContain(
      "billing-api, orders-api lose the shared /api/shop-management route",
    );
    expect(result.fix).toContain("traefik.pathPrefix");
  });

  it("warns about only the backend that has no route of its own when the other sets a pathPrefix", () => {
    writeResource("orders-api");
    writeResource("billing-api", { traefik: { pathPrefix: "/api/billing" } });

    const result = checkSharedStackRoutes(testDir);

    expect(result.didPass).toBe(false);
    expect(result.message).toContain("orders-api lose the shared");
    expect(result.message).not.toContain("billing-api lose");
  });

  it("passes when both backends set a different pathPrefix", () => {
    writeResource("orders-api", { traefik: { pathPrefix: "/api/orders-v1" } });
    writeResource("billing-api", { traefik: { pathPrefix: "/api/billing-v1" } });
    expect(checkSharedStackRoutes(testDir).didPass).toBe(true);
  });

  it("warns when two backends set the same pathPrefix", () => {
    writeResource("orders-api", { traefik: { pathPrefix: "/api/v1" } });
    writeResource("billing-api", { traefik: { pathPrefix: "/api/v1" } });

    const result = checkSharedStackRoutes(testDir);

    expect(result.didPass).toBe(false);
    expect(result.message).toContain(
      'billing-api and orders-api both set traefik.pathPrefix "/api/v1"',
    );
  });

  it("ignores workers, frontends and unproxied bring-your-own resources, like the engine", () => {
    writeResource("orders-api");
    writeResource("jobs", { appType: "worker" });
    writeResource("storefront", { appType: "frontend" });
    writeResource("legacy", { appType: "bring-your-own", exposeViaProxy: false });
    expect(checkSharedStackRoutes(testDir).didPass).toBe(true);
  });

  it("does not group two service directories that declare the same stack, because the engine counts per directory", () => {
    writeResource("orders-api");
    const dir = join(testDir, "services", "other", "billing-api");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "service.json"),
      JSON.stringify({ appName: "billing-api", appType: "backend", stack: "shop" }),
    );
    expect(checkSharedStackRoutes(testDir).didPass).toBe(true);
  });
});

describe("doctor Docker Compose check", () => {
  it("passes when the compose plugin answers", async () => {
    const result = await checkDockerCompose(async () => "Docker Compose version v2.38.2\n");

    expect(result.didPass).toBe(true);
  });

  it("reports a timeout as not responding rather than missing", async () => {
    const timedOut = Object.assign(new Error("Command failed"), { killed: true });
    const result = await checkDockerCompose(async () => {
      throw timedOut;
    });

    expect(result.didPass).toBe(false);
    expect(result.message).toBe("Docker Compose did not respond within 10s");
    expect(result.message).not.toContain("not found");
    expect(result.fix).toContain("docs.docker.com/compose");
  });

  it("reports a failing command as not found", async () => {
    const result = await checkDockerCompose(async () => {
      throw Object.assign(new Error("docker: 'compose' is not a docker command"), { code: 1 });
    });

    expect(result.didPass).toBe(false);
    expect(result.message).toBe("Docker Compose plugin not found");
  });
});

describe("doctor --all, sections, and summary", () => {
  afterEach(() => {
    doctorCommand.setOptionValue("all", false);
    doctorCommand.setOptionValue("json", false);
    doctorCommand.setOptionValue("ping", true);
  });

  it("stops at the first failing check when all is false or omitted", async () => {
    const executed: string[] = [];
    const checks = [
      () => {
        executed.push("first");
        return { name: "First", didPass: true, message: "First passed" };
      },
      () => {
        executed.push("second");
        return { name: "Second", didPass: false, message: "Second failed", fix: "Fix second" };
      },
      () => {
        executed.push("third");
        return { name: "Third", didPass: false, message: "Third failed", fix: "Fix third" };
      },
    ];

    const results = await runChecks(checks, { all: false });

    expect(executed).toEqual(["first", "second"]);
    expect(results).toHaveLength(2);
    expect(results[1]?.name).toBe("Second");
  });

  it("continues past warnings and skipped checks when all is false", async () => {
    const executed: string[] = [];
    const checks = [
      () => {
        executed.push("warn");
        return { name: "Warn", didPass: false, isWarning: true, message: "Minor warning" };
      },
      () => {
        executed.push("skip");
        return { name: "Skip", didPass: true, isSkipped: true, message: "Skipped" };
      },
      () => {
        executed.push("pass");
        return { name: "Pass", didPass: true, message: "Passed" };
      },
    ];

    const results = await runChecks(checks);

    expect(executed).toEqual(["warn", "skip", "pass"]);
    expect(results).toHaveLength(3);
  });

  it("runs every check when all is true, even after earlier failures", async () => {
    const executed: string[] = [];
    const checks = [
      () => {
        executed.push("ports");
        return { name: "Host Ports", didPass: false, message: "Port 80 busy" };
      },
      () => {
        executed.push("env");
        return { name: "Environment Variables", didPass: false, message: ".env missing" };
      },
      () => {
        executed.push("configs");
        return { name: "Master Configs", didPass: true, message: "Configs ready" };
      },
    ];

    const results = await runChecks(checks, { all: true });

    expect(executed).toEqual(["ports", "env", "configs"]);
    expect(results.map((r) => r.name)).toEqual([
      "Host Ports",
      "Environment Variables",
      "Master Configs",
    ]);
  });

  it("skips container-dependent checks under --all when Container Runtime failed", async () => {
    let dependentCalled = false;
    let rawContainerCalled = false;
    let rawComposeCalled = false;

    const rawContainerImpl = vi.fn(() => {
      rawContainerCalled = true;
      return { name: "Container Resource Health", didPass: true, message: "OK" };
    });
    const wrappedContainerCheck = requiresContainerRuntime(
      "Container Resource Health",
      rawContainerImpl,
    );

    const rawComposeCheck = Object.assign(
      function checkDockerCompose() {
        rawComposeCalled = true;
        return { name: "Docker Compose", didPass: true, message: "OK" };
      },
      {
        requiresContainerRuntime: true,
        checkName: "Docker Compose",
      },
    );

    const checks = [
      () => ({
        name: CONTAINER_RUNTIME_CHECK,
        didPass: false,
        message: "Docker is not running",
      }),
      requiresContainerRuntime("Crash-looping containers", () => {
        dependentCalled = true;
        return { name: "Crash-looping containers", didPass: true, message: "Healthy" };
      }),
      wrappedContainerCheck,
      rawComposeCheck,
      () => ({
        name: "Environment Variables",
        didPass: false,
        message: "Missing .env",
      }),
    ];

    const results = await runChecks(checks, { all: true });

    expect(dependentCalled).toBe(false);
    expect(rawContainerCalled).toBe(false);
    expect(rawContainerImpl).not.toHaveBeenCalled();
    expect(rawComposeCalled).toBe(false);
    expect(results).toHaveLength(5);
    expect(results[1]).toMatchObject({
      name: "Crash-looping containers",
      didPass: true,
      isSkipped: true,
    });
    expect(results[2]).toMatchObject({
      name: "Container Resource Health",
      didPass: true,
      isSkipped: true,
    });
    expect(results[3]).toMatchObject({
      name: "Docker Compose",
      didPass: true,
      isSkipped: true,
    });
    expect(results[4]).toMatchObject({
      name: "Environment Variables",
      didPass: false,
    });
  });

  it("formats the one-line summary with passed, warned, failed, and skipped counts", () => {
    const summary = formatDoctorSummary([
      { name: "Docker", didPass: true, message: "OK" },
      { name: "WSL", didPass: false, isWarning: true, message: "Warning" },
      { name: "Env", didPass: false, message: "Missing .env" },
      { name: "Bun", didPass: true, isSkipped: true, message: "Skipped" },
      { name: "Smoke", didPass: true, isSkipped: true, message: "Skipped" },
    ]);

    expect(summary).toBe("1 passed, 1 warned, 1 failed, 2 skipped");
  });

  it("formats summary correctly for a warning-only run", () => {
    const summary = formatDoctorSummary([
      { name: "WSL", didPass: false, isWarning: true, message: "Warning" },
    ]);

    expect(summary).toBe("0 passed, 1 warned, 0 failed, 0 skipped");
  });

  it("treats unexpected check failures as failed in the summary instead of skipped", () => {
    const summary = formatDoctorSummary([
      { name: "Docker", didPass: true, message: "OK" },
      {
        name: "CrashCheck",
        didPass: false,
        isSkipped: false,
        message: "Check failed with an internal error",
      },
      { name: "SkippedCheck", didPass: true, isSkipped: true, message: "Skipped" },
    ]);

    expect(summary).toBe("1 passed, 1 failed, 1 skipped");
  });

  it("registers --all on doctorCommand and prints Machine, Project, and summary", async () => {
    expect(doctorCommand.options.some((opt) => opt.long === "--all")).toBe(true);

    const root = mkdtempSync(join(tmpdir(), "flisk-doctor-all-"));
    const originalCwd = process.cwd();
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();

    try {
      mkdirSync(join(root, ".tdk"), { recursive: true });
      writeFileSync(
        join(root, ".tdk", "project.json"),
        JSON.stringify({ project: { name: "doctor-all-test" } }),
      );
      process.chdir(root);
      Object.defineProperty(process, "platform", { configurable: true, value: "linux" });

      try {
        await doctorCommand.parseAsync(["--all", "--no-ping"], { from: "user" });
      } catch {
        // Expected when process.exit is called on failing checks
      }

      const lines = log.mock.calls.map((call) => String(call[0]));
      expect(lines.some((line) => line.includes("Machine"))).toBe(true);
      expect(lines.some((line) => line.includes("Project"))).toBe(true);
      expect(
        lines.some((line) => /^\d+ passed(?:, \d+ warned)?, \d+ failed, \d+ skipped$/.test(line)),
      ).toBe(true);
      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      process.chdir(originalCwd);
      if (platformDescriptor) Object.defineProperty(process, "platform", platformDescriptor);
      exit.mockRestore();
      log.mockRestore();
      error.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prints Project section when running --all outside a project even with failing checks", async () => {
    const root = mkdtempSync(join(tmpdir(), "flisk-doctor-no-project-"));
    const originalCwd = process.cwd();
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();

    try {
      process.chdir(root);
      Object.defineProperty(process, "platform", { configurable: true, value: "linux" });

      try {
        await doctorCommand.parseAsync(["--all", "--no-ping"], { from: "user" });
      } catch {
        // Expected when process.exit is called
      }

      const lines = log.mock.calls.map((call) => String(call[0]));
      expect(lines.some((line) => line.includes("Machine"))).toBe(true);
      expect(lines.some((line) => line.includes("Project"))).toBe(true);
      expect(
        lines.some((line) =>
          line.includes("Not in a Flisk project, so project checks were skipped"),
        ),
      ).toBe(true);
      expect(
        lines.some((line) => /^\d+ passed(?:, \d+ warned)?, \d+ failed, \d+ skipped$/.test(line)),
      ).toBe(true);
    } finally {
      process.chdir(originalCwd);
      if (platformDescriptor) Object.defineProperty(process, "platform", platformDescriptor);
      exit.mockRestore();
      log.mockRestore();
      error.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves machine-readable JSON envelope when --all and --json are combined", async () => {
    const root = mkdtempSync(join(tmpdir(), "flisk-doctor-json-all-"));
    const originalCwd = process.cwd();
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();

    try {
      mkdirSync(join(root, ".tdk"), { recursive: true });
      writeFileSync(
        join(root, ".tdk", "project.json"),
        JSON.stringify({ project: { name: "doctor-json-all" } }),
      );
      process.chdir(root);
      Object.defineProperty(process, "platform", { configurable: true, value: "linux" });

      try {
        await doctorCommand.parseAsync(["--all", "--json", "--no-ping"], { from: "user" });
      } catch {
        // Expected when process.exit is called on failing checks
      }

      const jsonCall = log.mock.calls.find((call) => {
        try {
          const parsed = JSON.parse(String(call[0]));
          return (
            parsed &&
            typeof parsed.schemaVersion === "number" &&
            parsed.data &&
            Array.isArray(parsed.data.checks)
          );
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const parsed = JSON.parse(String(jsonCall?.[0]));
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.data.checks.length).toBeGreaterThan(0);
      expect(typeof parsed.data.ready).toBe("boolean");
      expect(typeof parsed.data.inProject).toBe("boolean");
      expect(Array.isArray(parsed.errors)).toBe(true);

      const nonJsonCalls = log.mock.calls
        .map((call) => String(call[0]))
        .filter((str) => !str.startsWith("{"));
      expect(nonJsonCalls.some((str) => str.includes("Machine"))).toBe(false);
      expect(nonJsonCalls.some((str) => str.includes("Project"))).toBe(false);
      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      process.chdir(originalCwd);
      if (platformDescriptor) Object.defineProperty(process, "platform", platformDescriptor);
      exit.mockRestore();
      log.mockRestore();
      error.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("renders Project heading under --all when in a project even if project checks are empty", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const machineResults: CheckResult[] = [{ name: "Host Ports", didPass: true, message: "OK" }];
      const projectResults: CheckResult[] = [];

      renderDoctorOutput(machineResults, projectResults, true, { all: true });

      const lines = log.mock.calls.map((call) => String(call[0]));
      expect(lines.some((line) => line.includes("Machine"))).toBe(true);
      expect(lines.some((line) => line.includes("Project"))).toBe(true);
      expect(lines.some((line) => line.includes("Not in a Flisk project"))).toBe(false);
      expect(lines.some((line) => line.includes("1 passed, 0 failed, 0 skipped"))).toBe(true);
    } finally {
      log.mockRestore();
    }
  });

  it("renders Project heading and skipped message under --all when not in a project", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const machineResults: CheckResult[] = [
        { name: "Host Ports", didPass: false, message: "Port busy" },
      ];
      const projectResults: CheckResult[] = [];

      renderDoctorOutput(machineResults, projectResults, false, { all: true });

      const lines = log.mock.calls.map((call) => String(call[0]));
      expect(lines.some((line) => line.includes("Machine"))).toBe(true);
      expect(lines.some((line) => line.includes("Project"))).toBe(true);
      expect(
        lines.some((line) =>
          line.includes("Not in a Flisk project, so project checks were skipped"),
        ),
      ).toBe(true);
      expect(lines.some((line) => line.includes("0 passed, 1 failed, 0 skipped"))).toBe(true);
    } finally {
      log.mockRestore();
    }
  });

  it("does not print Machine or Project headings or summary without --all", async () => {
    const root = mkdtempSync(join(tmpdir(), "flisk-doctor-plain-"));
    const originalCwd = process.cwd();
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();

    try {
      mkdirSync(join(root, ".tdk"), { recursive: true });
      writeFileSync(
        join(root, ".tdk", "project.json"),
        JSON.stringify({ project: { name: "doctor-plain-test" } }),
      );
      process.chdir(root);
      Object.defineProperty(process, "platform", { configurable: true, value: "linux" });

      try {
        await doctorCommand.parseAsync(["--no-ping"], { from: "user" });
      } catch {
        // Expected when process.exit is called on failing checks
      }

      const lines = log.mock.calls.map((call) => String(call[0]));
      expect(lines.some((line) => line === "Machine")).toBe(false);
      expect(lines.some((line) => line === "\nProject" || line === "Project")).toBe(false);
      expect(lines.some((line) => /^\d+ passed, \d+ failed, \d+ skipped$/.test(line))).toBe(false);
      expect(checkWindowsRuntimeTools).not.toHaveBeenCalled();
      expect(checkWindowsDockerMode).not.toHaveBeenCalled();
      expect(checkWindowsHostConfiguration).not.toHaveBeenCalled();
    } finally {
      process.chdir(originalCwd);
      if (platformDescriptor) Object.defineProperty(process, "platform", platformDescriptor);
      exit.mockRestore();
      log.mockRestore();
      error.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("doctor native Windows diagnostics", () => {
  afterEach(() => {
    doctorCommand.setOptionValue("json", false);
    doctorCommand.setOptionValue("ping", true);
    vi.mocked(checkWindowsRuntimeTools).mockClear();
    vi.mocked(checkWindowsDockerMode).mockClear();
    vi.mocked(checkWindowsHostConfiguration).mockClear();
  });

  it("prints Windows diagnostics next to the native Windows refusal and exits 1", async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();

    try {
      Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
      await expect(doctorCommand.parseAsync([], { from: "user" })).rejects.toThrow(/exit/);
      expect(exit).toHaveBeenCalledWith(1);
      expect(error).toHaveBeenCalledWith(NATIVE_WINDOWS_DOCTOR_MESSAGE);
      expect(checkWindowsRuntimeTools).toHaveBeenCalledOnce();
      expect(checkWindowsDockerMode).toHaveBeenCalledOnce();
      expect(checkWindowsHostConfiguration).toHaveBeenCalledOnce();

      const text = log.mock.calls.map((call) => String(call[0])).join("\n");
      expect(text).toContain(NATIVE_WINDOWS_DOCTOR_MESSAGE);
      expect(text).toContain("Windows containers");
      expect(text).toContain("tdk.localhost");
      expect(text).toContain("core.autocrlf");
      expect(text).toContain("Hyper-V");
    } finally {
      if (platformDescriptor) Object.defineProperty(process, "platform", platformDescriptor);
      exit.mockRestore();
      log.mockRestore();
      error.mockRestore();
    }
  });

  it("includes Windows diagnostic findings in --json data.checks while staying unready", async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();

    try {
      Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
      await expect(doctorCommand.parseAsync(["--json"], { from: "user" })).rejects.toThrow(/exit/);
      expect(exit).toHaveBeenCalledWith(1);

      const raw = String(log.mock.calls.find((call) => String(call[0]).startsWith("{"))?.[0]);
      const report = JSON.parse(raw);
      expect(report.data.ready).toBe(false);
      expect(report.data.checks.map((check: CheckResult) => check.name)).toEqual([
        "Native Windows support",
        "Windows Runtime Tools",
        "Docker container mode",
        "Windows ports and DNS",
      ]);
      expect(report.data.checks[0].message).toBe(NATIVE_WINDOWS_DOCTOR_MESSAGE);
      expect(report.data.checks[2].didPass).toBe(false);
      expect(report.data.checks[3].message).toContain("core.autocrlf");
      expect(report.data.host).toMatchObject({ kind: "native-windows", canUp: false });
    } finally {
      if (platformDescriptor) Object.defineProperty(process, "platform", platformDescriptor);
      exit.mockRestore();
      log.mockRestore();
      error.mockRestore();
    }
  });
});
