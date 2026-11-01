// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { freePort } from "../../test-support/index.js";
import { superAgentManifests, writeSuperAgentProject } from "../super-agent-template.js";

type Step = { id: string; kind: string; status: string; attempts: number; error: string | null };
type Goal = {
  id: string;
  status: string;
  planner: string;
  answer: string | null;
  reason: string | null;
  revisions: number;
  steps: Step[];
};

const templates = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../templates/super-agent",
);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dirs: string[] = [];
const procs: ChildProcess[] = [];

afterEach(() => {
  for (const proc of procs.splice(0)) proc.kill("SIGKILL");
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), "super-agent-"));
  dirs.push(dir);
  writeSuperAgentProject(dir);
  return dir;
}

async function healthy(url: string): Promise<void> {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${url}/health`)).ok) return;
    } catch {
      // not up yet
    }
    await sleep(100);
  }
  throw new Error(`${url} never answered`);
}

/** Starts the services from their folders, as flisk up does; returns their base URLs. */
async function start(dir: string, env: Record<string, Record<string, string>> = {}) {
  const port = { planner: await freePort(), tools: await freePort() };
  const urls = {
    planner: `http://localhost:${port.planner}`,
    tools: `http://localhost:${port.tools}`,
  };
  const run = (name: string, p: number, extra: Record<string, string> = {}) => {
    const proc = spawn("node", ["server.mjs"], {
      cwd: join(dir, name),
      env: { ...process.env, PORT: String(p), ANTHROPIC_API_KEY: "", ...extra, ...env[name] },
    });
    procs.push(proc);
    return proc;
  };
  let planner = run("planner", port.planner);
  let tools = run("tools", port.tools);
  await healthy(urls.planner);
  await healthy(urls.tools);
  const agents = async () => {
    for (const name of ["researcher", "writer", "checker"]) {
      run(name, await freePort(), {
        AGENT_NAME: name,
        PLANNER_URL: urls.planner,
        TOOLS_URL: urls.tools,
      });
    }
  };
  const crashPlanner = async () => {
    const gone = new Promise((r) => planner.once("exit", r));
    planner.kill("SIGKILL");
    await gone;
    planner = run("planner", port.planner);
    await healthy(urls.planner);
  };
  /** kill -9 the tool server, run `meanwhile`, and start it again `downMs` later, as the flisk up supervisor does. */
  const crashTools = async (downMs: number, meanwhile: () => Promise<unknown>) => {
    const gone = new Promise((r) => tools.once("exit", r));
    tools.kill("SIGKILL");
    await gone;
    await meanwhile();
    await sleep(downMs);
    tools = run("tools", port.tools);
    await healthy(urls.tools);
  };
  const post = async (path: string, body: unknown, base = urls.planner) =>
    (await (
      await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    ).json()) as Record<string, unknown>;
  const goal = async (until: (g: Goal) => boolean) => {
    let g: Goal | undefined;
    for (let i = 0; i < 150 && !(g && until(g)); i++) {
      await sleep(200);
      g = ((await (await fetch(`${urls.planner}/goals`)).json()) as { goals: Goal[] }).goals[0];
    }
    return g;
  };
  return { urls, agents, crashPlanner, crashTools, post, goal };
}

describe("super-agent template", () => {
  it("declares five local processes; the sub-agents wait for the planner and the tool server", () => {
    const manifests = superAgentManifests();
    expect(Object.keys(manifests).sort()).toEqual([
      "checker/service.json",
      "planner/service.json",
      "researcher/service.json",
      "tools/service.json",
      "writer/service.json",
    ]);
    for (const manifest of Object.values(manifests))
      expect(manifest.command).toBe("node server.mjs");
    expect(manifests["tools/service.json"]?.appType).toBe("mcp");
    expect(manifests["writer/service.json"]?.dependsOn).toEqual(["planner", "tools"]);
    const ports = Object.values(manifests).map((m) => m.port);
    expect(new Set(ports).size).toBe(5);
  });

  it("writes the project, with the optional SDK only in planner/package.json", () => {
    const dir = project();
    for (const file of [
      "README.md",
      ".gitignore",
      "lib/agent.mjs",
      "planner/plan.mjs",
      "planner/package.json",
      "tools/server.mjs",
      "checker/service.json",
    ]) {
      expect(existsSync(join(dir, file)), file).toBe(true);
    }
  });

  it("turns a goal into research, an answer and a passing check, with the tools over MCP", async () => {
    const swarm = await start(project());
    await swarm.agents();
    await swarm.post("/goals", { goal: "flisk and mcp" });
    const g = await swarm.goal((x) => x.status !== "running");
    expect(g?.status).toBe("done");
    expect(g?.planner).toBe("rules");
    expect(g?.steps.map((s) => s.kind)).toEqual(["research", "research", "write", "check"]);
    expect(g?.answer).toContain("local development loop");
    expect(g?.answer).toContain("Model Context Protocol");
  }, 40_000);

  it("sends empty research back, and fails the goal once the checker runs out of revisions", async () => {
    const swarm = await start(project(), { researcher: { BAD_RATE: "1" } });
    await swarm.agents();
    await swarm.post("/goals", { goal: "flisk" });
    const g = await swarm.goal((x) => x.status !== "running");
    expect(g?.status).toBe("failed");
    expect(g?.revisions).toBe(2);
    expect(g?.reason).toMatch(
      /checker still rejected the answer after 2 revisions: research step .* has no note/,
    );
  }, 40_000);

  it("keeps its goals across a planner kill -9 and restart, and the sub-agents finish them", async () => {
    const swarm = await start(project());
    await swarm.post("/goals", { goal: "agents. retries" });
    await swarm.crashPlanner();
    await swarm.agents();
    const g = await swarm.goal((x) => x.status !== "running");
    expect(g?.status).toBe("done");
    expect(g?.answer).toContain("goes back in the queue");
  }, 40_000);

  it("backs off between retries, so research outlives a tool server restart", async () => {
    const swarm = await start(project());
    await swarm.agents();
    await swarm.crashTools(1_500, () => swarm.post("/goals", { goal: "flisk" }));
    const g = await swarm.goal((x) => x.status !== "running");
    expect(g?.status).toBe("done");
    const research = g?.steps.find((s) => s.kind === "research");
    expect(research?.attempts).toBeGreaterThanOrEqual(2);
    expect(research?.error).toMatch(/fetch|connect|ECONNREFUSED|lookup/i);
  }, 40_000);

  it("without backoff, the same restart burns every attempt and fails the goal", async () => {
    const swarm = await start(project(), { planner: { RETRY_BACKOFF_MS: "0" } });
    await swarm.agents();
    await swarm.crashTools(1_500, () => swarm.post("/goals", { goal: "flisk" }));
    const g = await swarm.goal((x) => x.status !== "running");
    expect(g?.status).toBe("failed");
    expect(g?.reason).toMatch(/failed 3 times/);
  }, 40_000);

  it("drops a stale answer from an expired claim once the step is claimed again", async () => {
    const swarm = await start(project(), { planner: { CLAIM_MS: "300" } });
    await swarm.post("/goals", { goal: "flisk" });
    const first = (await swarm.post("/claim", { agent: "slow", kinds: ["research"] })) as {
      step: { id: string; attempt: number };
    };
    let second: { step: { id: string; attempt: number } | null } = { step: null };
    for (let i = 0; i < 30 && !second.step; i++) {
      await sleep(100);
      second = (await swarm.post("/claim", {
        agent: "fresh",
        kinds: ["research"],
      })) as typeof second;
    }
    expect(second.step).toMatchObject({ id: first.step.id, attempt: 2 });
    expect(
      await swarm.post("/complete", {
        id: first.step.id,
        attempt: 1,
        result: { topic: "flisk", note: "stale" },
      }),
    ).toEqual({ error: "claim expired" });
  }, 30_000);

  it("speaks the MCP edges flisk mcp check tests: initialize, read-only tools, errors, 400 and 405", async () => {
    const swarm = await start(project());
    const mcp = `${swarm.urls.tools}/mcp`;
    const rpc = (method: string, params?: unknown) =>
      swarm.post("/mcp", { jsonrpc: "2.0", id: 1, method, params }, swarm.urls.tools);
    const init = (await rpc("initialize", { protocolVersion: "2025-03-26" })) as {
      result: { serverInfo: { name: string }; capabilities: Record<string, unknown> };
    };
    expect(init.result.serverInfo.name).toBe("super-agent-tools");
    expect(init.result.capabilities).toHaveProperty("tools");
    const list = (await rpc("tools/list")) as {
      result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] };
    };
    expect(list.result.tools.map((t) => t.name)).toEqual(["lookup", "calc", "word_count"]);
    expect(list.result.tools.every((t) => t.annotations.readOnlyHint)).toBe(true);
    expect(
      await rpc("tools/call", { name: "calc", arguments: { expression: "(2 + 3) * 4" } }),
    ).toMatchObject({
      result: { content: [{ text: "20" }] },
    });
    expect(
      await rpc("tools/call", { name: "calc", arguments: { expression: "process.exit()" } }),
    ).toMatchObject({ result: { isError: true } });
    expect(await rpc("no/such_method")).toMatchObject({ error: { code: -32601 } });
    expect((await fetch(mcp, { method: "POST", body: "not json" })).status).toBe(400);
    expect((await fetch(mcp)).status).toBe(405);
  }, 30_000);
});

describe("super-agent planner", () => {
  const load = async () =>
    (await import(pathToFileURL(join(templates, "planner/plan.mjs")).href)) as {
      planWithRules: (goal: string) => string[];
      planWithModel: (goal: string, client: unknown) => Promise<string[]>;
      plan: (goal: string) => Promise<{ topics: string[]; planner: string }>;
    };
  const fakeClient = (response: Record<string, unknown>) => {
    const calls: Record<string, unknown>[] = [];
    return {
      calls,
      beta: {
        messages: {
          create: async (request: Record<string, unknown>) => {
            calls.push(request);
            return response;
          },
        },
      },
    };
  };

  it("plans with rules when no key is set", async () => {
    const { plan } = await load();
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(await plan("a and b; c")).toEqual({ topics: ["a", "b", "c"], planner: "rules" });
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it("asks claude-opus-5-5 for a structured plan with server-side fallbacks, and reads the topics", async () => {
    const { planWithModel } = await load();
    const client = fakeClient({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ topics: [" flisk ", "mcp", ""] }) }],
    });
    expect(await planWithModel("explain flisk and mcp", client)).toEqual(["flisk", "mcp"]);
    expect(client.calls[0]).toMatchObject({
      model: "claude-opus-5-5",
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema" } },
      messages: [{ role: "user", content: "explain flisk and mcp" }],
    });
  });

  it("throws on a refusal or an empty plan, so the caller falls back to the rules", async () => {
    const { planWithModel } = await load();
    await expect(
      planWithModel("x", fakeClient({ stop_reason: "refusal", content: [] })),
    ).rejects.toThrow(/declined/);
    await expect(
      planWithModel(
        "x",
        fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: '{"topics":[]}' }] }),
      ),
    ).rejects.toThrow(/no topics/);
  });
});
