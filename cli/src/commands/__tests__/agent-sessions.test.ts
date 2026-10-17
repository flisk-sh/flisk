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

  function runTdkAsync(args: string[], cwd: string) {
    return new Promise<{ status: number | null; stdout: string }>((resolve) => {
      const child = spawn(process.execPath, [cliPath, ...args], { cwd });
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
      const res = await runTdkAsync(["agent", "sessions", "bot", "--json"], tmp);
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
      const res = await runTdkAsync(["agent", "sessions", "bot", "--json"], tmp);
      expect(res.status).toBe(0);
      expect(JSON.parse(res.stdout).data.session).toEqual([{ id: "a" }]);
    } finally {
      server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
