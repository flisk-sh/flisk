// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { captureExit, createTempProject, runCommandInProcess } from "../../test-support/index.js";
import { clearDiscoveryCache } from "../../utils/discovery-context.js";
import {
  agentCommand,
  agentSessionRequest,
  formatAge,
  formatSessionTable,
  httpGet,
} from "../agent.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const cliPath = path.join(repoRoot, "cli", "bin", "flisk.js");

function runFlisk(args: string[], cwd: string) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf-8",
  });
}

describe("flisk agent sessions", () => {
  it("fails when called outside a Flisk project", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-agent-outside-"));
    try {
      const res = runFlisk(["agent", "sessions", "bot", "--json"], tmp);
      expect(res.status).not.toBe(0);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.errors[0].code).toBe("COMMAND_FAILED");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // The three envelope-only cases below read one shared project and run `agentCommand` in-process, so they
  // need no child process. Each reads only its own output, so they share the project made in `beforeAll`.
  let envelopeProject = "";

  beforeAll(() => {
    envelopeProject = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-agent-envelope-"));
    fs.mkdirSync(path.join(envelopeProject, ".flisk"), { recursive: true });
    fs.writeFileSync(path.join(envelopeProject, ".flisk", "project.json"), "{}\n");
    fs.mkdirSync(path.join(envelopeProject, "services", "api"), { recursive: true });
    fs.writeFileSync(
      path.join(envelopeProject, "services", "api", "service.json"),
      JSON.stringify({ appName: "api", appType: "backend", port: 4000 }),
    );
  });

  afterAll(() => {
    fs.rmSync(envelopeProject, { recursive: true, force: true });
  });

  beforeEach(() => {
    // The discovery cache lives for one second and is not keyed by project, so each in-process run starts clean.
    clearDiscoveryCache();
  });

  /** Runs `agent sessions` in-process from `root` and returns the one JSON envelope it printed and its exit code. */
  async function runEnvelopeCase(root: string, args: string[]) {
    const exit = captureExit();
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((line?: unknown) => {
      lines.push(String(line));
    });
    const cwd = process.cwd();
    process.chdir(root);
    try {
      await expect(
        agentCommand.parseAsync(["sessions", ...args, "--json"], { from: "user" }),
      ).rejects.toThrow("process.exit");
      // The command prints its own envelope first. The top-level handler then catches the thrown exit and prints a
      // second envelope; the tests read only the first, so they never see the handler's INTERNAL line.
      return { status: exit.exit.mock.calls[0]?.[0], envelope: JSON.parse(lines[0] ?? "null") };
    } finally {
      process.chdir(cwd);
      log.mockRestore();
      exit.exit.mockRestore();
    }
  }

  it("reports UNKNOWN_RESOURCE when the resource does not exist in the project", async () => {
    const { status, envelope } = await runEnvelopeCase(envelopeProject, ["nonexistent"]);
    expect(status).toBe(1);
    expect(envelope.errors[0].code).toBe("UNKNOWN_RESOURCE");
  });

  it("reports NOT_AN_AGENT when the resource exists but is not an agent", async () => {
    const { status, envelope } = await runEnvelopeCase(envelopeProject, ["api"]);
    expect(status).toBe(1);
    expect(envelope.errors[0].code).toBe("NOT_AN_AGENT");
  });

  it("reports NO_PORT when an agent resource has no assigned port", async () => {
    const tmp = createTempProject({ resources: { bot: { appType: "agent" } } });
    try {
      const { status, envelope } = await runEnvelopeCase(tmp, ["bot", "--session-id", "s1"]);
      expect(status).toBe(1);
      expect(envelope.errors[0].code).toBe("NO_PORT");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  function agentProject(port: number): string {
    return createTempProject({ resources: { bot: { appType: "agent", port } } });
  }

  function runFliskAsync(args: string[], cwd: string, baseUrl?: string) {
    return new Promise<{ status: number | null; stdout: string; stderr: string; output: string }>(
      (resolve) => {
        const child = spawn(process.execPath, [cliPath, ...args], {
          cwd,
          env: { ...process.env, ...(baseUrl ? { FLISK_SERVICE_BASE_URL: baseUrl } : {}) },
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => {
          stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk;
        });
        child.on("close", (status) => resolve({ status, stdout, stderr, output: stdout + stderr }));
      },
    );
  }

  it("nests the agent response under a fixed session key without overwriting agent or port", async () => {
    const payload = { agent: "spoofed", port: 1, checkpoints: [1, 2] };
    const server = http.createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(payload));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const tmp = agentProject(port);
    try {
      const res = await runFliskAsync(
        ["agent", "sessions", "bot", "--session-id", "s1", "--json"],
        tmp,
        `http://127.0.0.1:${port}`,
      );
      expect(res.status).toBe(0);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.data).toEqual({ agent: "bot", port, session: payload });
    } finally {
      server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("keeps an array response shape under session", async () => {
    const server = http.createServer((_req, res) => {
      res.end(JSON.stringify([{ id: "a" }]));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const tmp = agentProject(port);
    try {
      const res = await runFliskAsync(
        ["agent", "sessions", "bot", "--session-id", "s1", "--json"],
        tmp,
        `http://127.0.0.1:${port}`,
      );
      expect(res.status).toBe(0);
      expect(JSON.parse(res.stdout).data.session).toEqual([{ id: "a" }]);
    } finally {
      server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  /** Starts a loopback server that answers every request with `body` (JSON-encoded unless a string) and `status`. */
  async function agentServer(status: number, body: unknown, seen: string[] = []) {
    const server = http.createServer((req, res) => {
      seen.push(String(req.url));
      res.statusCode = status;
      if (typeof body !== "string") res.setHeader("content-type", "application/json");
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return { server, port: (server.address() as AddressInfo).port };
  }

  const LISTED = {
    sessions: [
      {
        sessionId: "s1",
        lastActivity: "2026-10-26T10:00:00.000Z",
        status: "idle",
        checkpointBytes: 2048,
      },
    ],
    total: 1,
  };

  it("lists sessions from GET /sessions when --session-id is omitted", async () => {
    const seen: string[] = [];
    const { server, port } = await agentServer(200, LISTED, seen);
    const tmp = agentProject(4999);
    try {
      const res = await runFliskAsync(
        ["agent", "sessions", "bot", "--json"],
        tmp,
        `http://127.0.0.1:${port}`,
      );
      expect(res.status).toBe(0);
      expect(seen).toEqual(["/api/bot/sessions"]);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.errors).toEqual([]);
      expect(envelope.data).toEqual({ agent: "bot", port: 4999, ...LISTED });
    } finally {
      server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("prints the session list as a table", async () => {
    const { server, port } = await agentServer(200, LISTED);
    const tmp = agentProject(4999);
    try {
      const res = await runFliskAsync(
        ["agent", "sessions", "bot"],
        tmp,
        `http://127.0.0.1:${port}`,
      );
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Sessions for bot:");
      expect(res.stdout).toMatch(/SESSION\s+LAST ACTIVITY\s+STATUS\s+CHECKPOINT/);
      expect(res.stdout).toMatch(/s1\s+\S+ ago\s+idle\s+2\.0 KB/);
    } finally {
      server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  for (const [label, status, body] of [
    ["answers GET /sessions with its JSON 404", 404, { error: "not_found" }],
    ["answers GET /sessions with something other than a list", 200, { sessionId: "", turns: 0 }],
  ] as const) {
    it(`reports SESSION_LIST_UNSUPPORTED when an older agent ${label}`, async () => {
      const { server, port } = await agentServer(status, body);
      const tmp = agentProject(4999);
      try {
        const res = await runFliskAsync(
          ["agent", "sessions", "bot", "--json"],
          tmp,
          `http://127.0.0.1:${port}`,
        );
        expect(res.status).toBe(1);
        const envelope = JSON.parse(res.stdout);
        expect(envelope.data).toBeNull();
        expect(envelope.errors).toEqual([
          expect.objectContaining({
            code: "SESSION_LIST_UNSUPPORTED",
            message: expect.stringContaining("does not serve GET /sessions"),
          }),
        ]);
      } finally {
        server.close();
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  }

  it("tells a human how to read one session when the agent cannot list them", async () => {
    const { server, port } = await agentServer(404, { error: "not_found" });
    const tmp = agentProject(4999);
    try {
      const res = await new Promise<{ status: number | null; output: string }>((resolve) => {
        const child = spawn(process.execPath, [cliPath, "agent", "sessions", "bot"], {
          cwd: tmp,
          env: { ...process.env, FLISK_SERVICE_BASE_URL: `http://127.0.0.1:${port}` },
        });
        let output = "";
        child.stdout.on("data", (chunk) => {
          output += chunk;
        });
        child.stderr.on("data", (chunk) => {
          output += chunk;
        });
        child.on("close", (status) => resolve({ status, output }));
      });
      expect(res.status).toBe(1);
      expect(res.output).toContain("does not serve GET /sessions");
      expect(res.output).toContain("flisk agent sessions bot --session-id <id>");
      expect(res.output).not.toContain("404");
    } finally {
      server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("refuses --watch with --json before reading the project", async () => {
    const { status, envelope } = await runEnvelopeCase(envelopeProject, ["nonexistent", "--watch"]);
    expect(status).toBe(1);
    expect(envelope.errors[0].code).toBe("USAGE");
  });

  it("redraws the list with --watch until interrupted", async () => {
    const seen: string[] = [];
    const { server, port } = await agentServer(200, LISTED, seen);
    const tmp = agentProject(4999);
    const child = spawn(process.execPath, [cliPath, "agent", "sessions", "bot", "--watch"], {
      cwd: tmp,
      env: { ...process.env, FLISK_SERVICE_BASE_URL: `http://127.0.0.1:${port}` },
    });
    try {
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      // Two refreshes are 2 seconds apart; wait for the second one, then stop the loop like Ctrl+C would.
      for (let i = 0; i < 100 && seen.length < 2; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(seen.length).toBeGreaterThanOrEqual(2);
      expect(output).toContain("Refreshing every 2s. Ctrl+C to stop.");
      expect(output.match(/Sessions for bot:/g)?.length).toBeGreaterThanOrEqual(1);
    } finally {
      child.kill("SIGINT");
      server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 20_000);

  it("keeps UNKNOWN_RESOURCE ahead of any request when --session-id is omitted", async () => {
    const { envelope } = await runEnvelopeCase(envelopeProject, ["nonexistent"]);
    expect(envelope.errors[0].code).toBe("UNKNOWN_RESOURCE");
  });

  it("forwards the session id as the x-session-id header", async () => {
    let seen: string | undefined;
    const server = http.createServer((req, res) => {
      seen = String(req.headers["x-session-id"]);
      res.end("{}");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const tmp = agentProject(port);
    try {
      const res = await runFliskAsync(
        ["agent", "sessions", "bot", "--session-id", "s1", "--json"],
        tmp,
        `http://127.0.0.1:${port}`,
      );
      expect(res.status).toBe(0);
      expect(seen).toBe("s1");
    } finally {
      server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reaches the agent through its ingress route, not the agent's own port", async () => {
    let seenPath: string | undefined;
    const server = http.createServer((req, res) => {
      seenPath = req.url;
      res.end("{}");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const ingressPort = (server.address() as AddressInfo).port;
    // The agent's own port (4999) has no listener: a CLI that still dials it would report AGENT_NOT_RUNNING.
    const tmp = agentProject(4999);
    try {
      const res = await runFliskAsync(
        ["agent", "sessions", "bot", "--session-id", "s1", "--json"],
        tmp,
        `http://127.0.0.1:${ingressPort}`,
      );
      expect(res.status).toBe(0);
      expect(seenPath).toBe("/api/bot/session");
      expect(JSON.parse(res.stdout).data.port).toBe(4999);
    } finally {
      server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("keeps the route host in the Host header and dials loopback for *.localhost routes", () => {
    const req = agentSessionRequest("http://api.demo.localhost:8080/api/bot", "s1");
    expect(req.url).toBe("http://127.0.0.1:8080/api/bot/session");
    expect(req.headers).toEqual({ "x-session-id": "s1", host: "api.demo.localhost:8080" });
    const plain = agentSessionRequest("http://127.0.0.1:9000/api/bot/", "s2");
    expect(plain.url).toBe("http://127.0.0.1:9000/api/bot/session");
    expect(plain.headers).toEqual({ "x-session-id": "s2" });
  });

  for (const [label, status, body, code] of [
    ["a 502 from the gateway", 502, "Bad Gateway", "AGENT_NOT_RUNNING"],
    ["a plain-text 404 from the gateway", 404, "404 page not found", "AGENT_NOT_RUNNING"],
    ["a JSON 404 from the agent", 404, '{"error":"no such session"}', "AGENT_REQUEST_FAILED"],
  ] as const) {
    it(`reports ${code} for ${label}`, async () => {
      const server = http.createServer((_req, res) => {
        res.statusCode = status;
        res.end(body);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const port = (server.address() as AddressInfo).port;
      const tmp = agentProject(4999);
      try {
        const res = await runFliskAsync(
          ["agent", "sessions", "bot", "--session-id", "s1", "--json"],
          tmp,
          `http://127.0.0.1:${port}`,
        );
        expect(res.status).toBe(1);
        expect(JSON.parse(res.stdout).errors[0].code).toBe(code);
      } finally {
        server.close();
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  }

  it("sends the route's host in the Host header for *.localhost routes", async () => {
    let seenHost: string | undefined;
    const server = http.createServer((req, res) => {
      seenHost = req.headers.host;
      res.end("{}");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const tmp = agentProject(4999);
    try {
      const res = await runFliskAsync(
        ["agent", "sessions", "bot", "--session-id", "s1", "--json"],
        tmp,
        `http://demo.localhost:${port}`,
      );
      expect(res.status).toBe(0);
      expect(seenHost).toBe(`api.demo.localhost:${port}`);
    } finally {
      server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("formats ages and the session table", () => {
    const now = Date.parse("2026-10-26T10:00:00.000Z");
    expect(formatAge("2026-10-26T09:59:48.000Z", now)).toBe("12s ago");
    expect(formatAge("2026-10-26T09:55:00.000Z", now)).toBe("5m ago");
    expect(formatAge("2026-10-26T07:00:00.000Z", now)).toBe("3h ago");
    expect(formatAge("2026-10-24T10:00:00.000Z", now)).toBe("2d ago");
    expect(formatAge(null, now)).toBe("-");
    expect(formatSessionTable({ sessions: [], total: 0 }, now)).toEqual(["No sessions yet."]);
    expect(
      formatSessionTable(
        {
          sessions: [
            { sessionId: "a", lastActivity: null, status: "active", checkpointBytes: null },
            {
              sessionId: "longer-id",
              lastActivity: "2026-10-26T09:59:48.000Z",
              status: "idle",
              checkpointBytes: 10,
            },
          ],
          total: 5,
        },
        now,
      ),
    ).toEqual([
      "SESSION    LAST ACTIVITY  STATUS  CHECKPOINT",
      "a          -              active  -",
      "longer-id  12s ago        idle    10 B",
      "... 3 more not shown",
    ]);
  });
  it("re-exports httpGet from the agent command module", () => {
    expect(typeof httpGet).toBe("function");
  });

  it("prints session checkpoint in human output when --session-id is provided", async () => {
    const payload = { step: 4, memory: "initialized" };
    const { server, port } = await agentServer(200, payload);
    const tmp = agentProject(4999);
    try {
      const res = await runFliskAsync(
        ["agent", "sessions", "bot", "--session-id", "s1"],
        tmp,
        `http://127.0.0.1:${port}`,
      );
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Sessions for bot:");
      expect(res.stdout).toContain('"step": 4');
      expect(res.stdout).toContain('"memory": "initialized"');
    } finally {
      server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("handles agent 500 error in human output with --session-id", async () => {
    const { server, port } = await agentServer(500, { error: "checkpoint_store_failed" });
    const tmp = agentProject(4999);
    try {
      const res = await runFliskAsync(
        ["agent", "sessions", "bot", "--session-id", "s1"],
        tmp,
        `http://127.0.0.1:${port}`,
      );
      expect(res.status).toBe(1);
      expect(res.output).toContain("Agent returned 500: checkpoint_store_failed");
    } finally {
      server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("handles agent 500 error in --json mode with --session-id", async () => {
    const { server, port } = await agentServer(500, { error: "checkpoint_store_failed" });
    const tmp = agentProject(4999);
    try {
      const res = await runFliskAsync(
        ["agent", "sessions", "bot", "--session-id", "s1", "--json"],
        tmp,
        `http://127.0.0.1:${port}`,
      );
      expect(res.status).toBe(1);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.errors).toEqual([
        expect.objectContaining({
          code: "AGENT_REQUEST_FAILED",
          message: "Agent returned 500: checkpoint_store_failed",
        }),
      ]);
    } finally {
      server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("prints human output when sessions list is empty without --session-id", async () => {
    const { server, port } = await agentServer(200, { sessions: [], total: 0 });
    const tmp = agentProject(4999);
    try {
      const res = await runFliskAsync(
        ["agent", "sessions", "bot"],
        tmp,
        `http://127.0.0.1:${port}`,
      );
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Sessions for bot:");
      expect(res.stdout).toContain("No sessions yet.");
    } finally {
      server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("handles agent 500 error in human output without --session-id", async () => {
    const { server, port } = await agentServer(500, { error: "database_timeout" });
    const tmp = agentProject(4999);
    try {
      const res = await runFliskAsync(
        ["agent", "sessions", "bot"],
        tmp,
        `http://127.0.0.1:${port}`,
      );
      expect(res.status).toBe(1);
      expect(res.output).toContain("Agent returned 500: database_timeout");
    } finally {
      server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("handles agent 500 error in --json mode without --session-id", async () => {
    const { server, port } = await agentServer(500, { error: "database_timeout" });
    const tmp = agentProject(4999);
    try {
      const res = await runFliskAsync(
        ["agent", "sessions", "bot", "--json"],
        tmp,
        `http://127.0.0.1:${port}`,
      );
      expect(res.status).toBe(1);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.errors).toEqual([
        expect.objectContaining({
          code: "AGENT_REQUEST_FAILED",
          message: "Agent returned 500: database_timeout",
        }),
      ]);
    } finally {
      server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("fails in human mode when resource does not exist", () => {
    const res = runFlisk(["agent", "sessions", "nonexistent"], envelopeProject);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Resource "nonexistent" not found in project.');
  });

  it("fails in human mode when resource is not an agent", () => {
    const res = runFlisk(["agent", "sessions", "api"], envelopeProject);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Resource "api" is of type "backend", not "agent".');
  });

  it("fails in human mode when agent has no port", () => {
    const tmp = createTempProject({ resources: { bot: { appType: "agent" } } });
    try {
      const res = runFlisk(["agent", "sessions", "bot"], tmp);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('Agent "bot" has no assigned port.');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
  describe("in-process sessions execution and coverage", () => {
    async function runInProcessAgent(args: string[], cwd: string, baseUrl: string) {
      clearDiscoveryCache();
      const sessionsCmd = agentCommand.commands.find((c) => c.name() === "sessions");
      if (sessionsCmd) {
        sessionsCmd.setOptionValue("sessionId", undefined);
        sessionsCmd.setOptionValue("watch", false);
        sessionsCmd.setOptionValue("json", false);
      }
      const prevBaseUrl = process.env.FLISK_SERVICE_BASE_URL;
      process.env.FLISK_SERVICE_BASE_URL = baseUrl;
      try {
        return await runCommandInProcess(agentCommand, ["sessions", ...args], cwd);
      } finally {
        if (prevBaseUrl === undefined) delete process.env.FLISK_SERVICE_BASE_URL;
        else process.env.FLISK_SERVICE_BASE_URL = prevBaseUrl;
      }
    }

    it("runs sessions in-process without --session-id and prints table", async () => {
      const { server, port } = await agentServer(200, LISTED);
      const tmp = agentProject(4999);
      try {
        const res = await runInProcessAgent(["bot"], tmp, `http://127.0.0.1:${port}`);
        expect(res.status).toBeUndefined();
        expect(res.stdout).toContain("Sessions for bot:");
        expect(res.stdout).toContain("s1");
      } finally {
        server.close();
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("runs sessions in-process with --session-id and prints checkpoint", async () => {
      const { server, port } = await agentServer(200, { state: "checkpoint_ok" });
      const tmp = agentProject(4999);
      try {
        const res = await runInProcessAgent(
          ["bot", "--session-id", "s1"],
          tmp,
          `http://127.0.0.1:${port}`,
        );
        expect(res.status).toBeUndefined();
        expect(res.stdout).toContain("Sessions for bot:");
        expect(res.stdout).toContain('"state": "checkpoint_ok"');
      } finally {
        server.close();
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("handles 500 error in-process without --session-id", async () => {
      const { server, port } = await agentServer(500, { error: "agent_crash" });
      const tmp = agentProject(4999);
      try {
        const res = await runInProcessAgent(["bot"], tmp, `http://127.0.0.1:${port}`);
        expect(res.status).toBe(1);
        expect(res.stderr).toContain("Agent returned 500: agent_crash");
      } finally {
        server.close();
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("handles 500 error in-process with --session-id", async () => {
      const { server, port } = await agentServer(500, { error: "checkpoint_crash" });
      const tmp = agentProject(4999);
      try {
        const res = await runInProcessAgent(
          ["bot", "--session-id", "s1"],
          tmp,
          `http://127.0.0.1:${port}`,
        );
        expect(res.status).toBe(1);
        expect(res.stderr).toContain("Agent returned 500: checkpoint_crash");
      } finally {
        server.close();
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("handles not-found 404 in-process with --session-id", async () => {
      const { server, port } = await agentServer(404, { error: "session_not_found" });
      const tmp = agentProject(4999);
      try {
        const res = await runInProcessAgent(
          ["bot", "--session-id", "s-missing"],
          tmp,
          `http://127.0.0.1:${port}`,
        );
        expect(res.status).toBe(1);
        expect(res.stderr).toContain("Agent returned 404: session_not_found");
      } finally {
        server.close();
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("handles agent not running in-process when sessionId is provided", async () => {
      const tmp = agentProject(4999);
      try {
        const res = await runInProcessAgent(
          ["bot", "--session-id", "s1"],
          tmp,
          "http://127.0.0.1:1",
        );
        expect(res.status).toBe(1);
        expect(res.stderr).toContain("is not responding");
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("handles agent not running in-process when sessionId is omitted", async () => {
      const tmp = agentProject(4999);
      try {
        const res = await runInProcessAgent(["bot"], tmp, "http://127.0.0.1:1");
        expect(res.status).toBe(1);
        expect(res.stderr).toContain("is not responding");
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
});
