// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createTempProject,
  type InProcessRun,
  runCommandInProcess,
} from "../../test-support/index.js";
import { buildRenderBlueprint, buildWranglerToml, deployName } from "../../utils/deploy-export.js";

const SECRET = "sk_live_do-not-write-me-0123456789";

/** A project with a Docker backend, a Node agent, a Worker and a library, every one carrying a secret value. */
function exportProject(): string {
  return createTempProject({
    stacks: {
      api: {
        gateway: {
          appType: "backend",
          port: 3100,
          healthCheckPath: "/ready",
          env: { STRIPE_KEY: SECRET, DATABASE_URL: `postgres://u:${SECRET}@db/app` },
        },
        helper: { appType: "agent", port: 4801, env: { OPENAI_API_KEY: SECRET } },
        edge: { appType: "mcp", port: 3200, env: { API_TOKEN: SECRET } },
        shared: { appType: "library", env: { LIB_SECRET: SECRET } },
      },
    },
    files: {
      "services/api/gateway/Dockerfile": "FROM node:22\n",
      "services/api/helper/package.json": JSON.stringify({ scripts: { build: "tsc" } }),
      "services/api/edge/package.json": JSON.stringify({ main: "./src/worker.ts" }),
      "services/api/edge/src/worker.ts": "export default {};\n",
    },
  });
}

/** Runs `flisk export ...` in process on a fresh command object, so Commander's kept options cannot leak. */
async function runExport(args: string[], cwd: string): Promise<InProcessRun> {
  vi.resetModules();
  const { exportCommand } = await import("../export.js");
  return runCommandInProcess(exportCommand, args, cwd);
}

function listTree(root: string): string[] {
  return (fs.readdirSync(root, { recursive: true }) as string[]).map(String).sort();
}

describe("flisk export render", () => {
  it("writes a Render Blueprint at the project root with docker and node web services", async () => {
    const root = exportProject();
    const result = await runExport(["render"], root);
    expect(result.status ?? 0).toBe(0);
    expect(result.stdout).toContain("Nothing was deployed");

    const yaml = fs.readFileSync(path.join(root, "render.yaml"), "utf-8");
    expect(yaml).toContain(
      [
        "services:",
        "  - type: web",
        '    name: "edge"',
        "    runtime: node",
        '    rootDir: "services/api/edge"',
        '    buildCommand: "npm install"',
        '    startCommand: "npm start"',
        '    healthCheckPath: "/health"',
        "    envVars:",
        "      - key: API_TOKEN",
        "        sync: false",
        "  - type: web",
        '    name: "gateway"',
        "    runtime: docker",
        '    dockerfilePath: "./services/api/gateway/Dockerfile"',
        '    dockerContext: "./services/api/gateway"',
        '    healthCheckPath: "/ready"',
        "    envVars:",
        "      - key: DATABASE_URL",
        "        sync: false",
        "      - key: STRIPE_KEY",
        "        sync: false",
        "  - type: web",
        '    name: "helper"',
        "    runtime: node",
        '    rootDir: "services/api/helper"',
        '    buildCommand: "npm install && npm run build"',
      ].join("\n"),
    );
    // A library does not serve HTTP, so it is not a web service.
    expect(yaml).not.toContain("shared");
    expect(yaml).not.toContain(SECRET);
    expect(yaml).not.toMatch(/^\s+value:/m);
  });

  it("exports one resource into --out", async () => {
    const root = exportProject();
    const out = path.join(root, "deploy");
    const result = await runExport(["render", "--resource", "gateway", "--out", out], root);
    expect(result.status ?? 0).toBe(0);
    const yaml = fs.readFileSync(path.join(out, "render.yaml"), "utf-8");
    expect(yaml).toContain('name: "gateway"');
    expect(yaml).not.toContain('name: "helper"');
    expect(fs.existsSync(path.join(root, "render.yaml"))).toBe(false);
  });

  it("prints the Blueprint and writes nothing with --dry-run", async () => {
    const root = exportProject();
    const before = listTree(root);
    const result = await runExport(["render", "--dry-run"], root);
    expect(result.status ?? 0).toBe(0);
    expect(result.stdout).toContain("Dry run - would write render.yaml");
    expect(result.stdout).toContain("runtime: docker");
    expect(result.stdout).not.toContain(SECRET);
    expect(listTree(root)).toEqual(before);
  });

  it("refuses to replace an existing render.yaml unless --force", async () => {
    const root = exportProject();
    const file = path.join(root, "render.yaml");
    fs.writeFileSync(file, "# mine\n");

    const refused = await runExport(["render"], root);
    expect(refused.status).toBe(1);
    expect(refused.stderr + refused.stdout).toContain("already exists");
    expect(fs.readFileSync(file, "utf-8")).toBe("# mine\n");

    const forced = await runExport(["render", "--force"], root);
    expect(forced.status ?? 0).toBe(0);
    expect(fs.readFileSync(file, "utf-8")).toContain("services:");
  });

  it("refuses a resource that does not serve HTTP", async () => {
    const root = exportProject();
    const result = await runExport(["render", "--resource", "shared"], root);
    expect(result.status).toBe(1);
    expect(result.stderr + result.stdout).toContain("does not serve HTTP");
    expect(fs.existsSync(path.join(root, "render.yaml"))).toBe(false);
  });
});

describe("flisk export wrangler", () => {
  it("writes wrangler.toml next to the resource with a custom-domain route", async () => {
    const root = exportProject();
    const result = await runExport(
      ["wrangler", "--resource", "edge", "--route", "mcp.example.com"],
      root,
    );
    expect(result.status ?? 0).toBe(0);
    expect(result.stdout).toContain("Nothing was deployed");

    const toml = fs.readFileSync(path.join(root, "services/api/edge/wrangler.toml"), "utf-8");
    expect(toml).toContain('name = "edge"\nmain = "src/worker.ts"\n');
    expect(toml).toMatch(/^compatibility_date = "\d{4}-\d{2}-\d{2}"$/m);
    expect(toml).toContain('routes = [{ pattern = "mcp.example.com", custom_domain = true }]');
    expect(toml).toContain("#   API_TOKEN");
    expect(toml).not.toContain(SECRET);
    expect(toml).not.toContain("[vars]");
  });

  it("writes no routes without --route, and main is relative to --out", async () => {
    const root = exportProject();
    const out = path.join(root, "workers", "edge");
    const result = await runExport(["wrangler", "--resource", "edge", "--out", out], root);
    expect(result.status ?? 0).toBe(0);
    const toml = fs.readFileSync(path.join(out, "wrangler.toml"), "utf-8");
    expect(toml).toContain('main = "../../services/api/edge/src/worker.ts"');
    expect(toml).not.toContain("routes");
  });

  it("prints the file and writes nothing with --dry-run", async () => {
    const root = exportProject();
    const before = listTree(root);
    const result = await runExport(["wrangler", "--resource", "edge", "--dry-run"], root);
    expect(result.status ?? 0).toBe(0);
    expect(result.stdout).toContain("Dry run - would write");
    expect(result.stdout).toContain('name = "edge"');
    expect(result.stdout).not.toContain(SECRET);
    expect(listTree(root)).toEqual(before);
  });

  it("refuses to replace an existing wrangler.toml unless --force", async () => {
    const root = exportProject();
    const file = path.join(root, "services/api/edge/wrangler.toml");
    fs.writeFileSync(file, "# mine\n");

    const refused = await runExport(["wrangler", "--resource", "edge"], root);
    expect(refused.status).toBe(1);
    expect(refused.stderr + refused.stdout).toContain("already exists");
    expect(fs.readFileSync(file, "utf-8")).toBe("# mine\n");

    const forced = await runExport(["wrangler", "--resource", "edge", "--force"], root);
    expect(forced.status ?? 0).toBe(0);
    expect(fs.readFileSync(file, "utf-8")).toContain('name = "edge"');
  });

  it("rejects a --route that is a URL rather than a host", async () => {
    const root = exportProject();
    const result = await runExport(
      ["wrangler", "--resource", "edge", "--route", "https://mcp.example.com/x"],
      root,
    );
    expect(result.status).toBe(1);
    expect(result.stderr + result.stdout).toContain("--route must be a host name");
    expect(fs.existsSync(path.join(root, "services/api/edge/wrangler.toml"))).toBe(false);
  });

  it("reports an unknown resource", async () => {
    const root = exportProject();
    const result = await runExport(["wrangler", "--resource", "nope"], root);
    expect(result.status).toBe(1);
    expect(result.stderr + result.stdout).toContain("nope");
  });
});

describe("deploy-export builders", () => {
  it("never copy a secret value, whatever the env names are", () => {
    const root = exportProject();
    const resource = {
      name: "gateway",
      path: path.join(root, "services/api/gateway"),
      configPath: path.join(root, "services/api/gateway/service.json"),
      config: {
        appName: "gateway",
        appType: "backend" as const,
        env: { GOOD_NAME: SECRET, "bad name": SECRET, "x\ny": SECRET },
      },
    };
    const yaml = buildRenderBlueprint(root, [resource]);
    expect(yaml).not.toContain(SECRET);
    expect(yaml).toContain("- key: GOOD_NAME");
    expect(yaml).not.toContain("bad name");

    fs.writeFileSync(path.join(resource.path, "index.js"), "export default {};\n");
    const toml = buildWranglerToml(resource, resource.path, {
      now: new Date("2026-10-01T12:00:00Z"),
    });
    expect(toml).not.toContain(SECRET);
    expect(toml).toContain('compatibility_date = "2026-10-01"');
    expect(toml).toContain('main = "index.js"');
  });

  it("turns a resource name into one Render and Cloudflare accept", () => {
    expect(deployName("My_API.v2")).toBe("my-api-v2");
    expect(deployName("___")).toBe("service");
  });
});
