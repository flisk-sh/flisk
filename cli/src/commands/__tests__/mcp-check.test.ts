// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// `flisk mcp check` runs in a child process here (the built CLI), so the fake server in this process can answer it.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { afterEach, describe, expect, it } from "vitest";
import { type FakeMcpServer, startFakeMcpServer } from "../../test-support/fake-mcp-server.js";
import {
  cleanEnv,
  createTempDir,
  createTempProject,
  fliskBin,
  parseEnvelope,
} from "../../test-support/index.js";

interface AsyncRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runFliskAsync(
  args: string[],
  options: { cwd: string; env?: Record<string, string> },
): Promise<AsyncRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fliskBin, ...args], {
      cwd: options.cwd,
      env: cleanEnv({ NO_COLOR: "1", ...options.env }),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`flisk ${args.join(" ")} timed out; stderr: ${stderr}`));
    }, 25_000);
    child.once("error", reject);
    child.once("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

let server: FakeMcpServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("flisk mcp check", () => {
  it("prints a table and exits 0 when every check passes", async () => {
    server = await startFakeMcpServer();
    const result = await runFliskAsync(["mcp", "check", server.url], { cwd: createTempDir() });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`MCP check: ${server.url}`);
    expect(result.stdout).toMatch(/pass\s+initialize/);
    expect(result.stdout).toMatch(/skip\s+tools\/call\s+not run: pass --call/);
    expect(result.stdout).toContain("11 of 11 checks passed");
    expect(server.requests.some((r) => r.rpcMethod === "tools/call")).toBe(false);
    expect(server.requests[0]?.userAgent).toMatch(
      /^flisk-mcp-check\/\S+ \(\+https:\/\/flisk\.sh\)$/,
    );
  }, 30_000);

  it("prints one JSON envelope and exits 1 when a check fails", async () => {
    server = await startFakeMcpServer({ isReadOnly: false });
    const result = await runFliskAsync(["mcp", "check", server.url, "--json", "--call"], {
      cwd: createTempDir(),
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/^\{[^\n]*\}\n$/);
    const envelope = parseEnvelope(result.stdout);
    const data = envelope.data as {
      url: string;
      resource: string | null;
      didPass: boolean;
      failures: number;
      checks: Array<{ check: string; didPass: boolean }>;
    };
    expect(data).toMatchObject({ url: server.url, resource: null, didPass: false, failures: 1 });
    expect(data.checks.filter((c) => !c.didPass).map((c) => c.check)).toEqual([
      "readOnlyHint lookup",
    ]);
    expect(data.checks.map((c) => c.check)).toContain("tools/call lookup");
    expect(envelope.errors).toEqual([expect.objectContaining({ code: "MCP_CHECK_FAILED" })]);
  }, 30_000);

  it("resolves a resource name to the URL flisk status prints for it, plus /mcp", async () => {
    server = await startFakeMcpServer({ endpoint: "/api/docs-mcp/mcp" });
    const root = createTempProject({
      stacks: { tools: { "docs-mcp": { appType: "mcp", port: 4100 } } },
    });
    const result = await runFliskAsync(["mcp", "check", "docs-mcp", "--json"], {
      cwd: root,
      env: { FLISK_SERVICE_BASE_URL: server.urlFor("/") },
    });
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.errors).toEqual([]);
    expect(envelope.data).toMatchObject({ resource: "docs-mcp", url: server.url, didPass: true });
    expect(result.status).toBe(0);
  }, 30_000);

  it("refuses an unknown resource and a plain http URL off this machine", async () => {
    const root = createTempProject({
      stacks: { tools: { "docs-mcp": { appType: "mcp", port: 4100 } } },
    });
    const missing = await runFliskAsync(["mcp", "check", "nope", "--json"], { cwd: root });
    expect(missing.status).not.toBe(0);
    expect(parseEnvelope(missing.stdout).errors[0]?.message).toContain('Resource "nope" not found');

    const insecure = await runFliskAsync(["mcp", "check", "http://example.com/mcp", "--json"], {
      cwd: root,
    });
    expect(insecure.status).toBe(2);
    expect(parseEnvelope(insecure.stdout).errors[0]?.message).toContain("needs an https URL");
  }, 30_000);

  it("refuses a resource that is not an MCP server", async () => {
    const root = createTempProject({
      stacks: { app: { api: { appType: "backend", port: 4200 } } },
    });
    const result = await runFliskAsync(["mcp", "check", "api", "--json"], { cwd: root });
    expect(result.status).toBe(2);
    expect(parseEnvelope(result.stdout).errors[0]?.message).toContain("not an MCP server");
  }, 30_000);

  it("is listed under flisk mcp --help", async () => {
    const result = await runFliskAsync(["mcp", "--help"], { cwd: createTempDir() });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/check \[options\] <target>/);
  }, 30_000);
});

describe("plain flisk mcp after adding check", () => {
  it("is still the stdio MCP server and lists the Flisk tools", async () => {
    const child = spawn(process.execPath, [fliskBin, "mcp"], {
      cwd: createTempDir(),
      env: cleanEnv({ NO_COLOR: "1" }),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    try {
      const lines = createInterface({ input: child.stdout });
      const reply = new Promise<{ id: number; result: { tools: Array<{ name: string }> } }>(
        (resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("no tools/list reply")), 20_000);
          lines.on("line", (line) => {
            const message = JSON.parse(line) as {
              id: number;
              result: { tools: Array<{ name: string }> };
            };
            if (message.id !== 2) return;
            clearTimeout(timer);
            resolve(message);
          });
          child.once("exit", (code) => reject(new Error(`flisk mcp exited with ${code}`)));
        },
      );
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "t", version: "1" },
          },
        })}\n${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`,
      );
      const message = await reply;
      expect(message.result.tools.map((tool) => tool.name)).toContain("status");
      lines.close();
    } finally {
      child.kill();
    }
  }, 30_000);
});
