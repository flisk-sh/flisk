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
import { captureExit, createTempProject } from "../../test-support/index.js";
import { clearDiscoveryCache } from "../../utils/discovery-context.js";
import { agentCommand, agentSessionRequest } from "../agent.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const cliPath = path.join(repoRoot, "cli", "bin", "flisk.js");

function runTdk(args: string[], cwd: string) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf-8",
  });
}

describe("flisk agent sessions", () => {
  it("fails when called outside a Flisk project", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-agent-outside-"));
    try {
      const res = runTdk(["agent", "sessions", "bot", "--json"], tmp);
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
    envelopeProject = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-agent-envelope-"));
    fs.mkdirSync(path.join(envelopeProject, ".tdk"), { recursive: true });
    fs.writeFileSync(path.join(envelopeProject, ".tdk", "project.json"), "{}\n");
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

  function runTdkAsync(args: string[], cwd: string, baseUrl?: string) {
    return new Promise<{ status: number | null; stdout: string }>((resolve) => {
      const child = spawn(process.execPath, [cliPath, ...args], {
        cwd,
        env: { ...process.env, ...(baseUrl ? { TDK_SERVICE_BASE_URL: baseUrl } : {}) },
      });
      let stdout = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.on("close", (status) => resolve({ status, stdout }));
    });
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
      const res = await runTdkAsync(
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
      const res = await runTdkAsync(
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

  it("requires --session-id and sends no request when it is missing", async () => {
    let requests = 0;
    const server = http.createServer((_req, res) => {
      requests += 1;
      res.end("{}");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const tmp = agentProject(port);
    try {
      const { status, envelope } = await runEnvelopeCase(tmp, ["bot"]);
      expect(status).toBe(1);
      expect(envelope.data).toBeNull();
      expect(envelope.errors).toHaveLength(1);
      expect(envelope.errors[0].code).toBe("SESSION_ID_REQUIRED");
      expect(requests).toBe(0);
    } finally {
      server.close();
    }
  });

  it("keeps UNKNOWN_RESOURCE ahead of SESSION_ID_REQUIRED", async () => {
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
      const res = await runTdkAsync(
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
      const res = await runTdkAsync(
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
        const res = await runTdkAsync(
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
      const res = await runTdkAsync(
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
});
