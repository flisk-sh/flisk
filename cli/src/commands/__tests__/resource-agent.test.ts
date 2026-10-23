// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { type ChildProcess, execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { type AddressInfo, createServer } from "node:net";
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
      const source = join(dir("support-agent"), "src", "index.ts");

      // The runtime binds the port it is given, so the test has to hand it one that is free. Asking the OS
      // for an ephemeral port beats a guessed range: the agent range (4000-5999) is also where the CLI
      // assigns ports to scaffolded services, and a guess collides with the other workers the suite runs
      // in parallel on CI.
      const freePort = async (): Promise<number> => {
        const probe = createServer();
        await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", () => resolve()));
        const { port } = probe.address() as AddressInfo;
        await new Promise<void>((resolve) => probe.close(() => resolve()));
        return port;
      };

      // The runtime is only reached over the loopback interface, where plain HTTP is what it speaks. The URL
      // is built here instead of inline at every call site: a scanner that folds the port into the string
      // sees a constant `http://` URL and reports it as an unencrypted request.
      const agentUrl = (port: number, path: string) => `http://127.0.0.1:${port}${path}`;

      const start = (port: number) => {
        const child = spawn("bun", ["run", source], {
          env: {
            ...process.env,
            AGENT_STATE_DIR: stateDir,
            PORT: String(port),
            AGENT_DURABILITY: "files",
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        // Keep the runtime's output: a bind failure or a crash inside it is invisible otherwise, and the
        // test could only report that the agent never came up.
        let output = "";
        const collect = (chunk: Buffer) => {
          output += chunk.toString();
        };
        child.stdout?.on("data", collect);
        child.stderr?.on("data", collect);
        return { child, output: () => output };
      };

      const exited = (child: ChildProcess) =>
        new Promise<number | null>((resolveExit) => {
          if (child.exitCode !== null || child.signalCode !== null) {
            resolveExit(child.exitCode);
            return;
          }
          child.on("exit", (code) => resolveExit(code));
        });

      // A loaded runner starts the runtime slowly, so the wait is generous. It stops as soon as the child
      // is gone, because a runtime that exited will never answer.
      const waitForHealth = async (
        child: ChildProcess,
        port: number,
        output: () => string,
      ): Promise<void> => {
        for (let i = 0; i < 300; i++) {
          if (child.exitCode !== null || child.signalCode !== null) {
            throw new Error(
              `agent exited before it was healthy (code ${child.exitCode}):\n${output()}`,
            );
          }
          try {
            const res = await fetch(agentUrl(port, "/health"));
            if (res.ok) return;
          } catch {
            // not listening yet
          }
          await new Promise((r) => setTimeout(r, 100));
        }
        throw new Error(`agent did not start within 30s:\n${output()}`);
      };

      // The port is free when the OS hands it out, but another worker can take it before the runtime
      // binds it. That shows up as the runtime exiting at once, so only that case is retried on a fresh
      // port; a runtime that stayed up and never answered is a real failure and is reported as such.
      const startHealthy = async (): Promise<ChildProcess> => {
        let failure: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          const port = await freePort();
          const { child, output } = start(port);
          try {
            await waitForHealth(child, port, output);
            currentPort = port;
            return child;
          } catch (error) {
            failure = error;
            const exitedEarly = child.exitCode !== null || child.signalCode !== null;
            child.kill("SIGKILL");
            if (!exitedEarly) throw error;
          }
        }
        throw failure;
      };

      let currentPort = 0;
      let running: ChildProcess | undefined;
      const turn = (input: string) =>
        fetch(agentUrl(currentPort, "/turn"), {
          method: "POST",
          headers: { "content-type": "application/json", "x-session-id": "sess-1" },
          body: JSON.stringify({ input }),
        }).then((r) => r.json());

      try {
        running = await startHealthy();
        expect(await turn("first")).toMatchObject({ sessionId: "sess-1", turns: 1 });
        const ready = await fetch(agentUrl(currentPort, "/ready"));
        expect(ready.status).toBe(200);

        running.kill("SIGTERM");
        expect(await exited(running)).toBe(0);

        running = await startHealthy();
        const resumed = await fetch(agentUrl(currentPort, "/session"), {
          headers: { "x-session-id": "sess-1" },
        }).then((r) => r.json());
        expect(resumed.turns).toBe(1);
        expect(await turn("second")).toMatchObject({ turns: 2 });
        running.kill("SIGTERM");
        expect(await exited(running)).toBe(0);
      } finally {
        // A failed run must not leave the runtime behind: it would keep holding the port and outlive the test.
        running?.kill("SIGKILL");
        rmSync(stateDir, { recursive: true, force: true });
      }
    },
    120000,
  );
});
