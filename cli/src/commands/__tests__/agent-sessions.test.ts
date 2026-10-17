// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { agentSessionRequest } from "../agent.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const cliPath = path.join(repoRoot, "cli", "bin", "tdk.js");

function runTdk(args: string[], cwd: string) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf-8",
  });
}

describe("tdk agent sessions", () => {
  it("fails when called outside a TDK project", () => {
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

  it("reports UNKNOWN_RESOURCE when the resource does not exist in the project", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-agent-unknown-"));
    fs.mkdirSync(path.join(tmp, ".tdk"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".tdk", "project.json"), "{}\n");
    try {
      const res = runTdk(["agent", "sessions", "nonexistent", "--json"], tmp);
      expect(res.status).not.toBe(0);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.errors[0].code).toBe("UNKNOWN_RESOURCE");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reports NOT_AN_AGENT when the resource exists but is not an agent", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-agent-not-agent-"));
    fs.mkdirSync(path.join(tmp, ".tdk"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".tdk", "project.json"), "{}\n");
    fs.mkdirSync(path.join(tmp, "services", "api"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, "services", "api", "service.json"),
      JSON.stringify({ appName: "api", appType: "backend", port: 4000 }),
    );
    try {
      const res = runTdk(["agent", "sessions", "api", "--json"], tmp);
      expect(res.status).not.toBe(0);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.errors[0].code).toBe("NOT_AN_AGENT");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  function agentProject(port: number): string {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-agent-live-"));
    fs.mkdirSync(path.join(tmp, ".tdk"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".tdk", "project.json"), "{}\n");
    fs.mkdirSync(path.join(tmp, "services", "bot"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, "services", "bot", "service.json"),
      JSON.stringify({ appName: "bot", appType: "agent", port }),
    );
    return tmp;
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
      const res = await runTdkAsync(
        ["agent", "sessions", "bot", "--json"],
        tmp,
        `http://127.0.0.1:${port}`,
      );
      expect(res.status).toBe(1);
      const envelope = JSON.parse(res.stdout);
      expect(envelope.data).toBeNull();
      expect(envelope.errors).toHaveLength(1);
      expect(envelope.errors[0].code).toBe("SESSION_ID_REQUIRED");
      expect(requests).toBe(0);
    } finally {
      server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("keeps UNKNOWN_RESOURCE ahead of SESSION_ID_REQUIRED", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-agent-order-"));
    fs.mkdirSync(path.join(tmp, ".tdk"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".tdk", "project.json"), "{}\n");
    try {
      const res = runTdk(["agent", "sessions", "nonexistent", "--json"], tmp);
      expect(JSON.parse(res.stdout).errors[0].code).toBe("UNKNOWN_RESOURCE");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
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
