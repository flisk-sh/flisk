// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AGENT_RUNTIMES,
  resolveAgentDurability,
  resolveAgentRuntime,
} from "../../agent-runtimes/registry.js";
import { BACKEND_FRAMEWORKS, resolveBackendFramework } from "../../backend-frameworks/registry.js";
import { CREATABLE_RESOURCE_TYPES, RESOURCE_CONFIG_APP_TYPES } from "../../types/index.js";
import {
  PORT_RANGES,
  REQUIRED_PACKAGE_SCRIPTS,
  VALID_RESOURCE_TYPES,
} from "../../utils/constants.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const cliBin = join(repoRoot, "cli", "bin", "tdk.js");
const hasBun = spawnSync("bun", ["--version"], { encoding: "utf-8" }).status === 0;

function flisk(args: string[], cwd: string, input = "y\n") {
  return spawnSync(process.execPath, [cliBin, ...args], {
    cwd,
    encoding: "utf-8",
    input,
    env: { ...process.env, TDK_EXTENSION_SOURCE: repoRoot },
  });
}

describe("the agent resource type", () => {
  it("is a known, creatable type with the scripts and port range of an HTTP service", () => {
    expect(CREATABLE_RESOURCE_TYPES).toContain("agent");
    expect(VALID_RESOURCE_TYPES).toContain("agent");
    expect(RESOURCE_CONFIG_APP_TYPES).toContain("agent");
    expect(REQUIRED_PACKAGE_SCRIPTS.agent).toEqual(["dev", "build", "start"]);
    expect(PORT_RANGES.agent).toMatchObject({ min: 4000, max: 5999 });
  });

  it("is scaffolded by an agent runtime, not a backend --framework", () => {
    expect(Object.keys(BACKEND_FRAMEWORKS)).not.toContain("agent");
    expect(() => resolveBackendFramework("backend", "agent")).toThrow(/Unknown backend framework/);
    expect(resolveBackendFramework("agent")?.id).toBe("custom");
    expect(() => resolveBackendFramework("agent", "express")).toThrow(
      /cannot be combined with --type agent/,
    );
    expect(() =>
      resolveBackendFramework("agent", undefined, { id: "python", createFiles: [] }),
    ).toThrow(/cannot be combined with --type agent/);
  });

  it("resolves runtimes and durability by id, and rejects unknown ones", () => {
    expect(Object.keys(AGENT_RUNTIMES)).toEqual(["custom"]);
    expect(resolveAgentRuntime().id).toBe("custom");
    expect(() => resolveAgentRuntime("libfx")).toThrow(/Unknown agent runtime "libfx"/);
    expect(resolveAgentDurability()).toBe("files");
    expect(resolveAgentDurability("files")).toBe("files");
    expect(resolveAgentDurability("postgres")).toBe("postgres");
    expect(() => resolveAgentDurability("redis")).toThrow(/Unknown --durability "redis"/);
  });

  it("is accepted by the service schema, and the engine runs it as a backend", () => {
    const schema = JSON.parse(
      readFileSync(join(repoRoot, "engine", "schemas", "service-schema.json"), "utf-8"),
    );
    expect(schema.properties.appType.enum).toContain("agent");
    expect(schema.properties.type.enum).toContain("agent");
    expect(schema.properties.agent.properties.durability.enum).toEqual(["files", "postgres"]);
    expect(schema.properties.agent.properties.runtime.enum).toEqual(["custom"]);

    // The engine normalises an agent manifest once, where service.json is loaded, so every backend code path (routing,
    // health gate, DATABASE_URL, restart policy) applies. This pins the normalisation; see loader.test below for the rest.
    const loader = readFileSync(
      join(repoRoot, "engine", "topologies", "tilt", "manifest", "loader.star"),
      "utf-8",
    );
    expect(loader).toContain('manifest.get("appType") == "agent"');
    expect(loader).toContain('manifest["appType"] = "backend"');
    expect(loader).toContain('agent["durability"] = agent.get("durability") or "files"');
  });

  it("gets a named state volume for files durability, declared at the top of the compose file", () => {
    const compose = readFileSync(
      join(repoRoot, "engine", "topologies", "platform", "docker", "compose", "compose.star"),
      "utf-8",
    );
    expect(compose).toContain("res_name + '-agent-state'");
    expect(compose).toContain("AGENT_STATE_DIR=/var/lib/tdk-agent");
    expect(compose).toContain("AGENT_DURABILITY={}");
    expect(compose).toContain('line.strip().startswith("# tdk-agent-volume: ")');
    expect(compose).toContain('volumes_section = "\\nvolumes:\\n"');
    // flisk down must not remove volumes: no compose invocation in the CLI passes -v or --volumes.
    const down = readFileSync(join(repoRoot, "cli", "src", "commands", "down.ts"), "utf-8");
    expect(down).not.toMatch(/["']-v["']|--volumes/);
  });

  it("renders custom agent templates for files and postgres durability", () => {
    const customRuntime = AGENT_RUNTIMES.custom;
    const filesIndex = customRuntime.createIndex("files-bot", "files");
    expect(filesIndex).toContain("AGENT_STATE_DIR");
    expect(filesIndex).toContain("renameSync(tmp, file)");
    expect(filesIndex).not.toContain("from 'pg'");

    const pgIndex = customRuntime.createIndex("pg-bot", "postgres");
    expect(pgIndex).toContain("from 'pg'");
    expect(pgIndex).toContain("tdk_agent_sessions");
    expect(pgIndex).toContain("DATABASE_URL");
    expect(pgIndex).toContain("CREATE TABLE IF NOT EXISTS tdk_agent_sessions");
    expect(pgIndex).toContain("ON CONFLICT (session_id) DO UPDATE");
  });
});

describe("flisk resource --type agent", () => {
  let projectRoot = "";

  beforeAll(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "tdk-agent-"));
    execFileSync(process.execPath, [cliBin, "project", "--yes"], {
      cwd: projectRoot,
      env: { ...process.env, TDK_EXTENSION_SOURCE: repoRoot },
    });
  }, 30000);

  afterAll(() => {
    if (projectRoot.startsWith(tmpdir())) rmSync(projectRoot, { recursive: true, force: true });
  }, 15000);

  const dir = (name: string) => join(projectRoot, "services", "shop", name);
  const json = (name: string, file: string) =>
    JSON.parse(readFileSync(join(dir(name), file), "utf-8"));

  it("scaffolds a long-running agent with files durability by default", () => {
    const result = flisk(
      ["resource", "support-agent", "--type", "agent", "--stack", "shop"],
      projectRoot,
    );
    expect(result.status, result.stderr).toBe(0);

    const service = json("support-agent", "service.json");
    expect(service).toMatchObject({
      appType: "agent",
      type: "agent",
      stack: "shop",
      healthCheckPath: "/health",
      agent: { runtime: "custom", durability: "files" },
    });
    expect(service).not.toHaveProperty("framework");
    expect(service).not.toHaveProperty("language");
    expect(service.featuresEnabled).toEqual([]);
    expect(service.port).toBeGreaterThanOrEqual(4000);
    expect(service.port).toBeLessThanOrEqual(5999);

    // The custom runtime has no vendor dependency, so the package.json carries none.
    const pkg = json("support-agent", "package.json");
    expect(pkg.dependencies).toEqual({});
    expect(pkg.scripts).toMatchObject({
      dev: expect.any(String),
      build: "tsc",
      start: expect.any(String),
    });
    expect(existsSync(join(dir("support-agent"), "Dockerfile"))).toBe(true);
    expect(existsSync(join(dir("support-agent"), "tsconfig.json"))).toBe(true);
  }, 30000);

  it("scaffolds an agent with postgres durability", () => {
    const result = flisk(
      ["resource", "pg-agent", "--type", "agent", "--durability", "postgres", "--stack", "shop"],
      projectRoot,
    );
    expect(result.status).toBe(0);
    expect(existsSync(dir("pg-agent"))).toBe(true);

    const service = json("pg-agent", "service.json");
    expect(service).toMatchObject({
      agent: {
        runtime: "custom",
        durability: "postgres",
      },
    });

    const pkg = json("pg-agent", "package.json");
    expect(pkg.dependencies).toMatchObject({
      pg: "^8.13.0",
    });

    const index = readFileSync(join(dir("pg-agent"), "src", "index.ts"), "utf-8");
    expect(index).toContain("from 'pg'");
    expect(index).toContain("tdk_agent_sessions");
    expect(index).toContain("DATABASE_URL");
    expect(index).toContain("url.pathname === '/ready'");
  }, 30000);

  it("scaffolds the runtime index contract", () => {
    const index = readFileSync(join(dir("support-agent"), "src", "index.ts"), "utf-8");
    // Health is liveness, readiness is the store, and sessions route by header.
    expect(index).toContain("url.pathname === '/health'");
    expect(index).toContain("url.pathname === '/ready'");
    expect(index).toContain("x-session-id");
    // Drain on SIGTERM: stop taking turns, let in-flight requests finish, exit 0.
    expect(index).toContain("process.on('SIGTERM'");
    expect(index).toContain("server.close()");
    expect(index).toContain("process.exit(0)");
    // Files durability writes checkpoints atomically, under the volume path Flisk mounts.
    expect(index).toContain("renameSync(tmp, file)");
    expect(index).toContain("AGENT_STATE_DIR");
    expect(index).toContain("'0.0.0.0'");
    // No vendor is privileged: the scaffold imports nothing beyond Node built-ins.
    expect(index).not.toMatch(/from '(openai|@anthropic-ai|@ai-sdk|libfx|@mastra|langchain)/);
    expect(index).not.toMatch(/from '(?!node:)[^']+'/);
  }, 30000);

  it("rejects an unknown runtime, durability, or an agent flag on another type, before writing anything", () => {
    const runtime = flisk(
      ["resource", "bad-rt", "--type", "agent", "--runtime", "libfx", "--stack", "shop"],
      projectRoot,
    );
    expect(runtime.status).not.toBe(0);
    expect(`${runtime.stdout}${runtime.stderr}`).toMatch(/Unknown agent runtime "libfx"/);
    expect(existsSync(dir("bad-rt"))).toBe(false);

    const durability = flisk(
      ["resource", "bad-dur", "--type", "agent", "--durability", "redis", "--stack", "shop"],
      projectRoot,
    );
    expect(durability.status).not.toBe(0);
    expect(existsSync(dir("bad-dur"))).toBe(false);

    const wrongType = flisk(
      ["resource", "bad-type", "--type", "backend", "--durability", "files", "--stack", "shop"],
      projectRoot,
    );
    expect(wrongType.status).not.toBe(0);
    expect(`${wrongType.stdout}${wrongType.stderr}`).toMatch(/can only be used with --type agent/);
    expect(existsSync(dir("bad-type"))).toBe(false);
  }, 60000);

  it("rejects --framework and --language, which have no meaning for an agent", () => {
    const framework = flisk(
      ["resource", "bad-fw", "--type", "agent", "--framework", "express", "--stack", "shop"],
      projectRoot,
    );
    expect(framework.status).not.toBe(0);
    expect(`${framework.stdout}${framework.stderr}`).toMatch(
      /cannot be combined with --type agent|--framework can only be used/,
    );
    expect(existsSync(dir("bad-fw"))).toBe(false);
  }, 60000);

  // Runs the generated runtime for real: a turn is checkpointed, a restart resumes it, and SIGTERM exits cleanly.
  // Needs bun on PATH; the rest of the file does not.
  it.skipIf(!hasBun)(
    "keeps a session across a restart, and drains on SIGTERM",
    async () => {
      const stateDir = mkdtempSync(join(tmpdir(), "tdk-agent-state-"));
      const port = String(4800 + Math.floor(Math.random() * 500));
      const source = join(dir("support-agent"), "src", "index.ts");
      const start = () =>
        spawn("bun", ["run", source], {
          env: { ...process.env, AGENT_STATE_DIR: stateDir, PORT: port, AGENT_DURABILITY: "files" },
          stdio: "ignore",
        });
      const waitForHealth = async () => {
        for (let i = 0; i < 100; i++) {
          try {
            const res = await fetch(`http://127.0.0.1:${port}/health`);
            if (res.ok) return;
          } catch {
            // not listening yet
          }
          await new Promise((r) => setTimeout(r, 100));
        }
        throw new Error("agent did not start");
      };
      const exited = (child: ReturnType<typeof spawn>) =>
        new Promise<number | null>((resolveExit) => child.on("exit", (code) => resolveExit(code)));

      try {
        let child = start();
        await waitForHealth();
        const turn = (input: string) =>
          fetch(`http://127.0.0.1:${port}/turn`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-session-id": "sess-1" },
            body: JSON.stringify({ input }),
          }).then((r) => r.json());

        expect(await turn("first")).toMatchObject({ sessionId: "sess-1", turns: 1 });
        const ready = await fetch(`http://127.0.0.1:${port}/ready`);
        expect(ready.status).toBe(200);

        child.kill("SIGTERM");
        expect(await exited(child)).toBe(0);

        child = start();
        await waitForHealth();
        const resumed = await fetch(`http://127.0.0.1:${port}/session`, {
          headers: { "x-session-id": "sess-1" },
        }).then((r) => r.json());
        expect(resumed.turns).toBe(1);
        expect(await turn("second")).toMatchObject({ turns: 2 });
        child.kill("SIGTERM");
        expect(await exited(child)).toBe(0);
      } finally {
        rmSync(stateDir, { recursive: true, force: true });
      }
    },
    60000,
  );
});
