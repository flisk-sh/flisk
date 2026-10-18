// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import type { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TemplateEngine } from "../../generator/template-engine.js";
import type { ProjectConfig } from "../../types/index.js";
import {
  checkDockerNetworkCapacity,
  checkDuplicateResourceNames,
  checkDuplicateResourcePorts,
  checkFrontendBackendUrls,
  checkMigrationsInApi,
  checkNatsBroker,
  checkPrismaConsistency,
  checkResourcePackageJson,
  checkServiceUrlPorts,
  checkSharedPlatformPostgres,
  checkTiltInstances,
  parseTiltProcesses,
} from "../doctor-wiring.js";
import type { ExecAsync } from "../exec-async.js";

let root: string;

function resource(
  stack: string,
  name: string,
  config: Record<string, unknown>,
  files: Record<string, string> = { "package.json": "{}" },
) {
  const dir = join(root, "services", stack, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "service.json"), JSON.stringify({ appName: name, stack, ...config }));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(join(dir, file, ".."), { recursive: true });
    writeFileSync(join(dir, file), content);
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tdk-doctor-wiring-"));
  mkdirSync(join(root, ".tdk"), { recursive: true });
  writeFileSync(
    join(root, ".tdk", "project.json"),
    JSON.stringify({ project: { name: "reports-demo" } }),
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("checkResourcePackageJson", () => {
  it("passes when every resource has a package.json", () => {
    resource("app", "api", { appType: "backend", port: 4000 });
    expect(checkResourcePackageJson(root).didPass).toBe(true);
  });

  it("skips resources whose language provider owns the runtime files", () => {
    resource("app", "py", { appType: "backend", port: 4000, language: "python" }, {});
    expect(checkResourcePackageJson(root).didPass).toBe(true);
    resource("app", "bun-api", { appType: "backend", port: 4001, language: "bun" }, {});
    expect(checkResourcePackageJson(root).message).toContain("bun-api");
  });

  it("skips go and rust backends, which have no package.json", () => {
    resource("app", "gosvc", { appType: "backend", port: 4000, language: "go" }, {});
    resource("app", "rssvc", { appType: "backend", port: 4001, language: "rust" }, {});
    expect(checkResourcePackageJson(root).didPass).toBe(true);
  });

  it("does not require a package.json for a bring-your-own resource (image, dockerfile, buildContext)", () => {
    resource(
      "shop",
      "by-image",
      { appType: "bring-your-own", port: 4000, image: "nginx:1.27" },
      {},
    );
    resource(
      "shop",
      "by-dockerfile",
      { appType: "bring-your-own", port: 4001, dockerfile: "./Dockerfile" },
      { Dockerfile: "FROM nginx:1.27-alpine\n" },
    );
    resource(
      "shop",
      "by-context",
      { appType: "bring-your-own", port: 4002, buildContext: "../../..", dockerfile: "Dockerfile" },
      {},
    );
    const result = checkResourcePackageJson(root);
    expect(result.didPass).toBe(true);
    expect(result.message).not.toContain("without");
  });

  it.each(["backend", "frontend", "worker", "migrator", "mcp", "library", "sdk"])(
    "still fails a %s without a package.json, even next to a bring-your-own resource",
    (appType) => {
      resource("shop", "legacy", { appType: "bring-your-own", port: 4000, image: "nginx" }, {});
      resource("shop", "needs-pkg", { appType, port: 4100 }, {});
      const result = checkResourcePackageJson(root);
      expect(result.didPass).toBe(false);
      expect(result.message).toContain("1 resource without a package.json: needs-pkg");
    },
  );

  it("names the resource whose image build would fail", () => {
    resource("app", "api", { appType: "backend", port: 4000 });
    resource("app", "web", { appType: "frontend", port: 3000 }, { "src/main.ts": "" });
    const result = checkResourcePackageJson(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("1 resource without a package.json: web");
    expect(result.message).toContain("not found");
  });
});

describe("checkServiceUrlPorts", () => {
  it("passes when the URL uses the port the target listens on", () => {
    resource("id", "auth", { appType: "backend", port: 4400 });
    resource("app", "api", {
      appType: "backend",
      port: 4410,
      params: { JWKS_URL: "http://auth:4400/.well-known/jwks.json" },
    });
    expect(checkServiceUrlPorts(root).didPass).toBe(true);
  });

  it("catches a URL that guesses the wrong port", () => {
    resource("id", "auth", { appType: "backend", port: 4400 });
    resource("app", "api", {
      appType: "backend",
      port: 4410,
      params: { JWKS_URL: "http://auth:4000/.well-known/jwks.json" },
    });
    const result = checkServiceUrlPorts(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("api param JWKS_URL: auth:4000, but auth listens on 4400");
  });

  it("catches localhost pointing at another service", () => {
    resource("id", "auth", { appType: "backend", port: 4400 });
    resource("app", "api", {
      appType: "backend",
      port: 4410,
      params: { AUTH_URL: "http://localhost:4400", SELF: "http://localhost:4410" },
    });
    const result = checkServiceUrlPorts(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("api param AUTH_URL: localhost:4400");
    expect(result.message).not.toContain("SELF");
  });

  it("ignores URLs to hosts that are not resources", () => {
    resource("app", "api", {
      appType: "backend",
      port: 4410,
      params: { ISSUER: "https://tenant.auth0.com:443/" },
    });
    expect(checkServiceUrlPorts(root).didPass).toBe(true);
  });
});

describe("checkFrontendBackendUrls", () => {
  beforeEach(() => resource("store", "catalog-api", { appType: "backend", port: 4300 }));

  it("catches a frontend calling a backend port on localhost", () => {
    resource(
      "store",
      "web",
      { appType: "frontend", port: 3300 },
      {
        "package.json": "{}",
        "src/api.ts": "export const URL = 'http://localhost:4300';",
      },
    );
    const result = checkFrontendBackendUrls(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("src/api.ts:1 calls localhost:4300 (catalog-api)");
    expect(result.fix).toContain("api.reports-demo.localhost/api/");
  });

  it("ignores comments, tests and unrelated ports", () => {
    resource(
      "store",
      "web",
      { appType: "frontend", port: 3300 },
      {
        "package.json": "{}",
        "src/api.ts": "// was http://localhost:4300\nconst dev = 'http://localhost:5173';",
        "tests/api.test.ts": "fetch('http://localhost:4300')",
        "src/api.test.ts": "fetch('http://localhost:4300')",
      },
    );
    expect(checkFrontendBackendUrls(root).didPass).toBe(true);
  });

  it("passes with the Traefik URL", () => {
    resource(
      "store",
      "web",
      { appType: "frontend", port: 3300 },
      {
        "package.json": "{}",
        "src/api.ts": "export const URL = 'http://api.demo.localhost/api/catalog';",
      },
    );
    expect(checkFrontendBackendUrls(root).didPass).toBe(true);
  });
});

describe("checkNatsBroker", () => {
  it("is skipped when nothing uses nats", () => {
    resource("app", "api", { appType: "backend", port: 4000 });
    const result = checkNatsBroker(root);
    expect(result.isSkipped).toBe(true);
  });

  it("fails when a resource uses nats and no messaging compose exists", () => {
    resource("app", "worker", { appType: "worker", featuresEnabled: ["nats"] });
    const result = checkNatsBroker(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("worker enable the nats feature");
    expect(result.fix).toContain("reports_demo_nats");
  });

  it("passes when the messaging compose file is there", () => {
    resource("app", "worker", { appType: "worker", featuresEnabled: ["nats"] });
    mkdirSync(join(root, "services", "platform", "messaging"), { recursive: true });
    writeFileSync(
      join(root, "services", "platform", "messaging", "docker-compose.yml"),
      "services: {}",
    );
    expect(checkNatsBroker(root).didPass).toBe(true);
  });
});

describe("checkSharedPlatformPostgres", () => {
  function writeGeneratedFocus(preAlphaStacks: string[] = ["app"]): void {
    const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
    const config = {
      ...featureOffProjectJson(),
      project: { name: "reports-demo", version: "1.0.0" },
      discovery: { paths: ["services/*/*"] },
      optional_infra: {},
      phases: {
        ...(featureOffProjectJson().phases as Record<string, unknown>),
        pre_alpha: { name: "Pre-Alpha", description: "", enabledStacks: preAlphaStacks },
      },
    } as ProjectConfig;
    const generated = new TemplateEngine(join(repoRoot, "cli", "templates")).generateAll(config);
    const output = join(root, ".tdk", ".tdk-out");
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, "Tiltfile"), generated.Tiltfile);
    writeFileSync(join(output, "spec.master"), generated["spec.master"]);
    for (const relativePath of [
      "discovery/config.star",
      "engine/topologies/tilt/config/profiles.star",
    ]) {
      const destination = join(output, "tdk-cli-ext", relativePath);
      mkdirSync(join(destination, ".."), { recursive: true });
      copyFileSync(join(repoRoot, relativePath), destination);
    }
  }

  function writeProjectJson(config: Record<string, unknown>): void {
    writeFileSync(join(root, ".tdk", "project.json"), JSON.stringify(config));
  }

  function featureOffProjectJson(): Record<string, unknown> {
    return {
      project: { name: "reports-demo" },
      always_enabled_infra: ["proxy"],
      phases: {
        pre_alpha: { name: "Pre-Alpha", description: "", enabledStacks: ["app"] },
        alpha: { name: "Alpha", description: "", enabledStacks: [] },
        beta: { name: "Beta", description: "", enabledStacks: [] },
        out_of_scope: { name: "Out of Scope", description: "", enabledStacks: [] },
      },
    };
  }

  function featureOnProjectJson(): Record<string, unknown> {
    return {
      project: { name: "reports-demo" },
      always_enabled_infra: ["database-management", "proxy"],
      phases: {
        pre_alpha: {
          name: "Pre-Alpha",
          description: "",
          enabledStacks: ["app", "database-management"],
        },
        alpha: { name: "Alpha", description: "", enabledStacks: [] },
        beta: { name: "Beta", description: "", enabledStacks: [] },
        out_of_scope: { name: "Out of Scope", description: "", enabledStacks: [] },
      },
    };
  }

  beforeEach(() => writeProjectJson(featureOffProjectJson()));

  it("passes when willStart because a resource depends on postgres", () => {
    resource("app", "orders-api", {
      appType: "backend",
      port: 4000,
      dependsOn: ["postgres"],
    });
    const result = checkSharedPlatformPostgres(root);
    expect(result.didPass).toBe(true);
    expect(result.name).toBe("Shared platform Postgres");
    expect(result.message).toContain("orders-api");
    expect(result.message).toContain("depend on postgres/database-management");
  });

  it("passes when willStart because a resource depends on database-management", () => {
    resource("app", "billing-api", {
      appType: "backend",
      port: 4100,
      dependsOn: ["database-management"],
    });
    const result = checkSharedPlatformPostgres(root);
    expect(result.didPass).toBe(true);
    expect(result.message).toContain("billing-api");
  });

  it("passes when willStart because the feature is on", () => {
    writeProjectJson(featureOnProjectJson());
    resource("app", "api", { appType: "backend", port: 4000 });
    const result = checkSharedPlatformPostgres(root);
    expect(result.didPass).toBe(true);
    expect(result.message).toContain("database-management feature is enabled");
  });

  it("skips when feature is off and nothing depends on either name", () => {
    resource("app", "api", { appType: "backend", port: 4000, dependsOn: [] });
    const result = checkSharedPlatformPostgres(root);
    expect(result.didPass).toBe(true);
    expect(result.isSkipped).toBe(true);
    expect(result.message).toContain("will not start");
  });

  it("warns from generated default focus when project.json has database-management off", () => {
    resource("app", "api", { appType: "backend", port: 4000 });
    writeGeneratedFocus();
    const result = checkSharedPlatformPostgres(root);
    expect(result.isWarning).toBe(true);
    expect(result.isSkipped).toBeFalsy();
    expect(result.message).toContain("default tdk up takes the feature path");
  });

  it("warns about the feature path even when a project dependency suggests the force path", () => {
    resource("app", "orders-api", {
      appType: "backend",
      port: 4000,
      dependsOn: ["postgres"],
    });
    writeGeneratedFocus();
    const result = checkSharedPlatformPostgres(root);
    expect(result.isWarning).toBe(true);
    expect(result.message).toContain("depend on postgres/database-management");
    expect(result.message).toContain("default tdk up takes the feature path");
  });

  it("does not claim default focus enables the feature before generation or with empty focus", () => {
    resource("app", "api", { appType: "backend", port: 4000 });
    expect(checkSharedPlatformPostgres(root).message).not.toContain("default tdk up");
    writeGeneratedFocus([]);
    expect(checkSharedPlatformPostgres(root).message).not.toContain("default tdk up");
  });

  it("fails on unknown typo dependsOn names and still reports will-start", () => {
    resource("app", "orders-api", {
      appType: "backend",
      port: 4000,
      dependsOn: ["postgress"],
    });
    resource("app", "billing-api", {
      appType: "backend",
      port: 4100,
      dependsOn: ["postgres"],
    });
    const result = checkSharedPlatformPostgres(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain('"postgress" (from orders-api)');
    expect(result.message).toContain("Postgres will start");
    expect(result.message).toContain("project resource set");
  });

  it("reports project-scope on the will-start success message", () => {
    resource("app", "orders-api", {
      appType: "backend",
      port: 4000,
      dependsOn: ["postgres"],
    });
    const result = checkSharedPlatformPostgres(root);
    expect(result.didPass).toBe(true);
    expect(result.message).toContain("project resource set");
    expect(result.message).toContain("tdk up may select a subset");
  });

  it("does not report postgres as a missing service when the dependency is present", () => {
    resource("app", "orders-api", {
      appType: "backend",
      port: 4000,
      dependsOn: ["postgres"],
    });
    const result = checkSharedPlatformPostgres(root);
    expect(result.didPass).toBe(true);
    expect(result.message.toLowerCase()).not.toContain("missing");
    expect(result.message.toLowerCase()).not.toContain("not a known service");
  });

  it("does not claim Prisma will start when prisma is not in featuresEnabled", () => {
    resource("app", "orders-api", {
      appType: "backend",
      port: 4000,
      dependsOn: ["postgres"],
    });
    const result = checkSharedPlatformPostgres(root);
    expect(result.didPass).toBe(true);
    expect(result.message).not.toMatch(/prisma/i);
  });

  it("agrees with evaluateSharedPlatformPostgres on the will-start predicate", async () => {
    const { evaluateSharedPlatformPostgres } = await import("../shared-platform-postgres.js");
    resource("app", "orders-api", {
      appType: "backend",
      port: 4000,
      dependsOn: ["postgres"],
    });
    const evaluation = evaluateSharedPlatformPostgres(root);
    const result = checkSharedPlatformPostgres(root);
    expect(result.didPass).toBe(evaluation.willStart);
    expect(evaluation.willStart).toBe(true);
  });

  it("finds the dependency through project-scoped discovery even without feature on", () => {
    resource("other", "billing-api", {
      appType: "backend",
      port: 4100,
      dependsOn: ["postgres"],
    });
    const result = checkSharedPlatformPostgres(root);
    expect(result.didPass).toBe(true);
    expect(result.message).toContain("billing-api");
  });
});

describe("checkPrismaConsistency", () => {
  const schema =
    'generator client { provider = "prisma-client-js" }\ndatasource db { provider = "postgresql" }\n';
  const config =
    'import { defineConfig, env } from "prisma/config"; export default defineConfig({ datasource: { url: env("DATABASE_URL") } });\n';
  const packages = { dependencies: { prisma: "7.5.0", "@prisma/client": "7.5.0" } };

  function validProject(overrides: Record<string, unknown> = {}): void {
    resource(
      "app",
      "orders-api-migrator",
      { appType: "migrator", port: 7000, featuresEnabled: ["prisma"], dependsOn: ["postgres"] },
      {
        "package.json": JSON.stringify(packages),
        "prisma/schema.prisma": schema,
        "prisma.config.ts": config,
      },
    );
    resource(
      "app",
      "orders-api",
      {
        appType: "backend",
        port: 4000,
        featuresEnabled: ["prisma"],
        dependsOn: ["orders-api-migrator"],
        ...overrides,
      },
      {
        "package.json": JSON.stringify(packages),
        "prisma/schema.prisma": schema,
        "prisma.config.ts": config,
      },
    );
  }

  it("passes one valid Prisma 7 API and migrator shape", () => {
    validProject();
    const result = checkPrismaConsistency(root);
    expect(result.didPass).toBe(true);
    expect(result.message).not.toContain("Prisma 8");
  });

  it("skips when no resource enables Prisma", () => {
    resource("app", "api", { appType: "backend", port: 4000, featuresEnabled: [] });
    const result = checkPrismaConsistency(root);
    expect(result.didPass).toBe(true);
    expect(result.isSkipped).toBe(true);
  });

  it("fails a legacy features prisma key even without featuresEnabled", () => {
    resource("app", "api", { appType: "backend", port: 4000, features: ["prisma"] });
    const result = checkPrismaConsistency(root);
    expect(result.didPass).toBe(false);
    expect(result.isSkipped).toBeFalsy();
    expect(result.message).toContain("use featuresEnabled");
  });

  it("accepts the generated process.env.DATABASE_URL config", () => {
    validProject();
    mkdirSync(join(root, "services/app/orders-api/.autogenerated"), { recursive: true });
    writeFileSync(
      join(root, "services/app/orders-api/.autogenerated/prisma.config.autogenerated.ts"),
      "export default { datasource: { url: process.env.DATABASE_URL } };",
    );
    rmSync(join(root, "services/app/orders-api/prisma.config.ts"));
    expect(checkPrismaConsistency(root).didPass).toBe(true);
  });

  it("ignores comments when checking the active datasource provider", () => {
    validProject();
    writeFileSync(
      join(root, "services/app/orders-api/prisma/schema.prisma"),
      '// provider = "postgresql"\ndatasource db { provider = "mysql" }',
    );
    expect(checkPrismaConsistency(root).didPass).toBe(false);
  });

  it("fails when prisma packages are missing", () => {
    validProject();
    writeFileSync(
      join(root, "services/app/orders-api/package.json"),
      JSON.stringify({ dependencies: {} }),
    );
    expect(checkPrismaConsistency(root).didPass).toBe(false);
  });

  it("fails when Prisma package majors differ", () => {
    validProject();
    writeFileSync(
      join(root, "services/app/orders-api/package.json"),
      JSON.stringify({ dependencies: { prisma: "7.5.0", "@prisma/client": "6.19.3" } }),
    );
    expect(checkPrismaConsistency(root).didPass).toBe(false);
  });

  it("fails when either Prisma major is not 7", () => {
    validProject();
    writeFileSync(
      join(root, "services/app/orders-api/package.json"),
      JSON.stringify({ dependencies: { prisma: "8.0.0", "@prisma/client": "8.0.0" } }),
    );
    expect(checkPrismaConsistency(root).didPass).toBe(false);
  });

  it("fails the legacy features key", () => {
    validProject({ featuresEnabled: [], features: ["prisma"] });
    expect(checkPrismaConsistency(root).didPass).toBe(false);
  });

  it("rejects a prisma API with no Postgres dependency (dependsOn empty)", () => {
    validProject({ dependsOn: [] });
    const result = checkPrismaConsistency(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("API must depend on its Prisma migrator");
    expect(result.message).toContain("postgres or database-management");
  });

  it("rejects a prisma API whose dependsOn names postgres but no migrator", () => {
    validProject({ dependsOn: ["postgres"] });
    const result = checkPrismaConsistency(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("API must depend on its Prisma migrator");
  });

  it("rejects a migrator that does not start Postgres", () => {
    validProject();
    writeFileSync(
      join(root, "services/app/orders-api-migrator/service.json"),
      JSON.stringify({
        appName: "orders-api-migrator",
        appType: "migrator",
        port: 7000,
        featuresEnabled: ["prisma"],
        dependsOn: [],
      }),
    );
    const result = checkPrismaConsistency(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("migrator must depend on postgres or database-management");
  });

  it("accepts database-management as the Postgres dependency of the migrator", () => {
    validProject();
    writeFileSync(
      join(root, "services/app/orders-api-migrator/service.json"),
      JSON.stringify({
        appName: "orders-api-migrator",
        appType: "migrator",
        port: 7000,
        featuresEnabled: ["prisma"],
        dependsOn: ["database-management"],
      }),
    );
    expect(checkPrismaConsistency(root).didPass).toBe(true);
  });

  it("rejects Prisma 6.19.3 next to a Prisma 7 client", () => {
    validProject();
    writeFileSync(
      join(root, "services/app/orders-api/package.json"),
      JSON.stringify({ dependencies: { prisma: "6.19.3", "@prisma/client": "^7.5.0" } }),
    );
    const result = checkPrismaConsistency(root);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("prisma packages must both be major 7");
  });

  it("fails when schema.prisma is missing", () => {
    validProject();
    rmSync(join(root, "services/app/orders-api/prisma/schema.prisma"));
    expect(checkPrismaConsistency(root).didPass).toBe(false);
  });

  it("fails when schema provider is not postgresql", () => {
    validProject();
    writeFileSync(
      join(root, "services/app/orders-api/prisma/schema.prisma"),
      'datasource db { provider = "mysql" }',
    );
    expect(checkPrismaConsistency(root).didPass).toBe(false);
  });

  it("fails when schema still owns url or directUrl", () => {
    validProject();
    writeFileSync(
      join(root, "services/app/orders-api/prisma/schema.prisma"),
      `${schema} datasource db { url = env("DATABASE_URL") }`,
    );
    expect(checkPrismaConsistency(root).didPass).toBe(false);
  });

  it("fails when Prisma config is missing or has the wrong URL", () => {
    validProject();
    rmSync(join(root, "services/app/orders-api/prisma.config.ts"));
    expect(checkPrismaConsistency(root).didPass).toBe(false);
  });

  it("fails when the migrator does not depend on Postgres", () => {
    validProject();
    writeFileSync(
      join(root, "services/app/orders-api-migrator/service.json"),
      JSON.stringify({
        appName: "orders-api-migrator",
        appType: "migrator",
        featuresEnabled: ["prisma"],
        dependsOn: [],
      }),
    );
    expect(checkPrismaConsistency(root).didPass).toBe(false);
  });

  it("fails when the API does not depend on its migrator", () => {
    validProject({ dependsOn: [] });
    expect(checkPrismaConsistency(root).didPass).toBe(false);
  });

  it("fails when the API start script migrates", () => {
    validProject();
    writeFileSync(
      join(root, "services/app/orders-api/package.json"),
      JSON.stringify({ ...packages, scripts: { start: "prisma migrate deploy && bun start" } }),
    );
    expect(checkPrismaConsistency(root).didPass).toBe(false);
  });

  it("allows prisma generate when the Prisma 7 schema and packages are present", () => {
    validProject();
    writeFileSync(
      join(root, "services/app/orders-api/Dockerfile"),
      "FROM oven/bun\nRUN prisma generate\n",
    );
    expect(checkPrismaConsistency(root).didPass).toBe(true);
  });

  it("fails when shared Postgres will not start", () => {
    validProject();
    writeFileSync(
      join(root, "services/app/orders-api-migrator/service.json"),
      JSON.stringify({
        appName: "orders-api-migrator",
        appType: "migrator",
        featuresEnabled: ["prisma"],
        dependsOn: [],
      }),
    );
    writeFileSync(
      join(root, "services/app/orders-api/service.json"),
      JSON.stringify({
        appName: "orders-api",
        appType: "backend",
        featuresEnabled: ["prisma"],
        dependsOn: ["orders-api-migrator"],
      }),
    );
    expect(checkPrismaConsistency(root).didPass).toBe(false);
  });
});

describe("checkTiltInstances", () => {
  const tiltLine = (pid: number, project: string) =>
    `${pid} tilt up -f ${project}/.tdk/.tdk-out/Tiltfile -- --focus=store`;
  const fakeExec = (output: string) => (() => output) as unknown as typeof execSync;

  it("parses pid and project root from ps output", () => {
    const ps = ["  501 /bin/zsh", `${tiltLine(42, "/work/a")}`, "77 grep tilt"].join("\n");
    expect(parseTiltProcesses(ps)).toEqual([{ pid: 42, root: "/work/a" }]);
  });

  it("passes when no Tilt is running", () => {
    expect(checkTiltInstances(root, fakeExec("1 launchd\n")).didPass).toBe(true);
  });

  it("fails on two Tilts for the same project", () => {
    const ps = `${tiltLine(10, root)}\n${tiltLine(11, root)}\n`;
    const result = checkTiltInstances(root, fakeExec(ps));
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("pids 10, 11");
  });

  it("only notes another project's Tilt", () => {
    const result = checkTiltInstances(root, fakeExec(`${tiltLine(20, "/work/other")}\n`));
    expect(result.didPass).toBe(true);
    expect(result.isSkipped).toBe(true);
    expect(result.message).toContain("/work/other (pid 20)");
  });
});

describe("checkDockerNetworkCapacity", async () => {
  it("passes and removes its probe network", async () => {
    const calls: string[] = [];
    const exec = (async (command: string) => {
      calls.push(command);
      return "";
    }) as unknown as ExecAsync;
    expect((await checkDockerNetworkCapacity(exec)).didPass).toBe(true);
    expect(calls[0]).toMatch(/^docker network create tdk_doctor_probe_/);
    expect(calls[1]).toMatch(/^docker network rm tdk_doctor_probe_/);
  });

  it("fails when Docker has no address pool left", async () => {
    const exec = (async () => {
      throw Object.assign(new Error("failed"), {
        stderr: Buffer.from(
          "Error response from daemon: all predefined address pools have been fully subnetted",
        ),
      });
    }) as unknown as ExecAsync;
    const result = await checkDockerNetworkCapacity(exec);
    expect(result.didPass).toBe(false);
    expect(result.fix).toContain("docker network prune");
  });

  it("does not fail on unrelated Docker errors", async () => {
    const exec = (async () => {
      throw Object.assign(new Error("boom"), {
        stderr: Buffer.from("Cannot connect to the Docker daemon"),
      });
    }) as unknown as ExecAsync;
    expect((await checkDockerNetworkCapacity(exec)).isSkipped).toBe(true);
  });
});

describe("checkMigrationsInApi", () => {
  const backend = { appType: "backend", port: 4000 };

  it("passes when no service runs a migration from its start-up", () => {
    resource("app", "api", backend, {
      "package.json": JSON.stringify({
        scripts: { start: "bun run dist/index.js", migrate: "prisma migrate deploy" },
      }),
      "src/index.ts": "export default {};",
    });
    const result = checkMigrationsInApi(root);
    expect(result.didPass).toBe(true);
    expect(result.isWarning).toBeUndefined();
  });

  it("warns about a migration in a start script, naming the script", () => {
    resource("app", "api", backend, {
      "package.json": JSON.stringify({
        scripts: { start: "prisma migrate deploy && bun run dist/index.js" },
      }),
    });
    const result = checkMigrationsInApi(root);
    expect(result.didPass).toBe(false);
    expect(result.isWarning).toBe(true);
    expect(result.message).toContain('api: package.json "start" script');
    expect(result.fix).toContain("migrator");
  });

  it("warns about a migration run from the service source, as the failing e2e did", () => {
    resource("app", "api", backend, {
      "package.json": "{}",
      "src/index.ts":
        'execFileSync("bunx", ["prisma", "migrate", "deploy"], { stdio: "inherit" });',
    });
    expect(checkMigrationsInApi(root).message).toContain("src/index.ts");
  });

  it("warns about a Dockerfile CMD or an entrypoint script, but not a build-time RUN", () => {
    resource("app", "cmd", backend, {
      "package.json": "{}",
      Dockerfile: 'FROM oven/bun\nCMD ["sh", "-c", "drizzle-kit migrate && bun start"]\n',
    });
    resource(
      "app",
      "run",
      { appType: "backend", port: 4001 },
      {
        "package.json": "{}",
        Dockerfile: "FROM oven/bun\nRUN bunx prisma migrate deploy\n",
      },
    );
    resource(
      "app",
      "entry",
      { appType: "worker", port: 4002 },
      {
        "package.json": "{}",
        "entrypoint.sh": "#!/bin/sh\nknex migrate:latest\nexec bun start\n",
      },
    );
    const message = checkMigrationsInApi(root).message;
    expect(message).toContain("cmd: ");
    expect(message).toContain("entry: ");
    expect(message).not.toContain("run: ");
  });

  it("leaves migrators, bring-your-own jobs, tests and comments alone", () => {
    const migrate = {
      "package.json": JSON.stringify({ scripts: { start: "prisma migrate deploy" } }),
    };
    resource("app", "db-migrator", { appType: "migrator", port: 7000 }, migrate);
    resource("app", "job", { appType: "bring-your-own", port: 4003 }, migrate);
    resource("app", "api", backend, {
      "package.json": "{}",
      "src/index.ts": "// run prisma migrate deploy from the migrator instead\n",
      "src/index.test.ts": "prisma migrate deploy",
    });
    expect(checkMigrationsInApi(root).didPass).toBe(true);
  });
});

describe("checkDuplicateResourceNames", () => {
  /** Same appName in two different directories. */
  function twin(dir: string, appName: string, config: Record<string, unknown> = {}) {
    const path = join(root, "services", dir);
    mkdirSync(path, { recursive: true });
    writeFileSync(
      join(path, "service.json"),
      JSON.stringify({ appName, appType: "backend", stack: "app", port: 4000, ...config }),
    );
  }

  it("fails when two directories use one appName, naming both paths", () => {
    twin("app/api", "api");
    twin("other/api-copy", "api");
    const result = checkDuplicateResourceNames(root);
    expect(result.didPass).toBe(false);
    expect(result.isWarning).toBeUndefined();
    expect(result.message).toContain('"api"');
    expect(result.message).toContain(join("services", "app", "api", "service.json"));
    expect(result.message).toContain(join("services", "other", "api-copy", "service.json"));
    expect(result.fix).toContain("appName");
  });

  it("fails across different types, because the name is what collides", () => {
    twin("app/web", "shop", { appType: "frontend" });
    twin("app/shop-api", "shop");
    expect(checkDuplicateResourceNames(root).didPass).toBe(false);
  });

  it("passes when every appName is unique, and with no resources", () => {
    expect(checkDuplicateResourceNames(root).didPass).toBe(true);
    twin("app/api", "api");
    twin("app/orders", "orders");
    expect(checkDuplicateResourceNames(root).didPass).toBe(true);
  });
});

describe("checkDuplicateResourcePorts", () => {
  it("warns, not fails, when two backends share a port", () => {
    resource("app", "api", { appType: "backend", port: 4000 });
    resource("app", "orders", { appType: "backend", port: 4000 });
    const result = checkDuplicateResourcePorts(root);
    expect(result.didPass).toBe(false);
    expect(result.isWarning).toBe(true);
    expect(result.message).toContain("port 4000: api, orders");
  });

  it("warns for a backend and a bring-your-own resource on one port", () => {
    resource("app", "api", { appType: "backend", port: 4000 });
    resource("app", "legacy", { appType: "bring-your-own", port: 4000 });
    expect(checkDuplicateResourcePorts(root).isWarning).toBe(true);
  });

  it("passes for distinct ports", () => {
    resource("app", "api", { appType: "backend", port: 4000 });
    resource("app", "orders", { appType: "backend", port: 4001 });
    const result = checkDuplicateResourcePorts(root);
    expect(result.didPass).toBe(true);
    expect(result.isWarning).toBeUndefined();
  });

  it("ignores frontends, workers, libraries, unrouted bring-your-own resources and missing ports", () => {
    resource("app", "api", { appType: "backend", port: 3000 });
    resource("app", "web", { appType: "frontend", port: 3000 });
    resource("app", "jobs", { appType: "worker", port: 3000 });
    resource("app", "lib", { appType: "library", port: 3000 });
    resource("app", "byo", { appType: "bring-your-own", port: 3000, exposeViaProxy: false });
    resource("app", "noport", { appType: "backend" });
    resource("app", "noport2", { appType: "backend" });
    expect(checkDuplicateResourcePorts(root).didPass).toBe(true);
  });
});
