// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// In-process cases for `flisk mcp check`: target resolution (URL rules, resource lookup), the text report, and the
// JSON envelope. The protocol checks themselves are covered in utils/__tests__/mcp-check.test.ts, so runMcpCheck is a
// double here.

import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeResource, parseEnvelope, runCommandInProcess } from "../../test-support/index.js";
import type { DiscoveredResource } from "../../types/index.js";
import { FliskError } from "../../utils/errors.js";
import type { McpCheckOptions, McpCheckReport } from "../../utils/mcp-check.js";
import { createMcpCheckCommand, resolveMcpCheckTarget } from "../mcp-check.js";

const paths = vi.hoisted(() => ({
  findProjectRoot: vi.fn<() => string | null>(),
  getPackageVersion: vi.fn<() => string>(() => "9.9.9"),
}));
const discovery = vi.hoisted(() => ({
  createDiscoveryContext: vi.fn<() => { resources: DiscoveredResource[] }>(),
}));
const hostPorts = vi.hoisted(() => ({
  getHostPortPlan: vi.fn<() => Promise<{ ingressHttp: number }>>(),
}));
const statusPorts = vi.hoisted(() => ({
  buildServicePorts:
    vi.fn<(resource: DiscoveredResource, ingressHttp?: number) => { url: string | null }>(),
}));
const checker = vi.hoisted(() => ({
  runMcpCheck: vi.fn<(url: string, options: McpCheckOptions) => Promise<McpCheckReport>>(),
}));

vi.mock("../../utils/paths.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths.js")>()),
  ...paths,
}));
vi.mock("../../utils/discovery-context.js", () => discovery);
vi.mock("../../utils/host-port-config.js", () => hostPorts);
vi.mock("../../utils/status-ports.js", () => statusPorts);
vi.mock("../../utils/mcp-check.js", () => checker);

// biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI colour codes from captured output.
const ANSI = /\u001b\[[0-9;]*m/g;

function passingReport(url: string): McpCheckReport {
  return {
    url,
    iconUrl: null,
    serverName: "demo-server",
    didPass: true,
    failures: 0,
    checks: [
      { check: "initialize", didPass: true, detail: "protocol 2025-03-26" },
      { check: "tools/call", didPass: true, isSkipped: true, detail: "pass --call to call tools" },
    ],
  };
}

function failingReport(url: string): McpCheckReport {
  return {
    url,
    iconUrl: null,
    serverName: null,
    didPass: false,
    failures: 1,
    checks: [
      { check: "initialize", didPass: true, detail: "ok" },
      { check: "tools/list", didPass: false, detail: "HTTP 500" },
    ],
  };
}

async function runCheck(args: string[]) {
  const result = await runCommandInProcess(createMcpCheckCommand(), args, tmpdir());
  return { ...result, stdout: result.stdout.replace(ANSI, "") };
}

describe("resolveMcpCheckTarget", () => {
  beforeEach(() => {
    paths.findProjectRoot.mockReturnValue("/project");
    hostPorts.getHostPortPlan.mockResolvedValue({ ingressHttp: 8080 });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("accepts an https URL as given, with no resource", async () => {
    await expect(resolveMcpCheckTarget("https://mcp.example.com/mcp")).resolves.toEqual({
      url: "https://mcp.example.com/mcp",
      resource: null,
    });
  });

  it.each([
    "http://localhost:3000/mcp",
    "http://app.localhost/mcp",
    "http://127.0.0.1:9000/mcp",
    "http://[::1]:9000/mcp",
  ])("accepts plain http on the loopback address %s", async (target) => {
    const resolved = await resolveMcpCheckTarget(target);
    expect(resolved.resource).toBeNull();
    expect(resolved.url).toBe(new URL(target).toString());
  });

  it("refuses plain http to a remote host with exit code 2", async () => {
    const error = await resolveMcpCheckTarget("http://mcp.example.com/mcp").catch((e) => e);
    expect(error).toBeInstanceOf(FliskError);
    expect(error.message).toBe("flisk mcp check needs an https URL, got http://mcp.example.com");
    expect(error.exitCode).toBe(2);
  });

  it("refuses a target with :// that is not a URL", async () => {
    const error = await resolveMcpCheckTarget("://nope").catch((e) => e);
    expect(error).toBeInstanceOf(FliskError);
    expect(error.message).toBe('"://nope" is not a valid URL');
    expect(error.exitCode).toBe(2);
  });

  it("resolves a resource name to its ingress URL plus /mcp", async () => {
    const tools = makeResource("tools", "mcp");
    discovery.createDiscoveryContext.mockReturnValue({ resources: [tools] });
    statusPorts.buildServicePorts.mockReturnValue({ url: "http://demo.localhost:8080/api/tools/" });

    await expect(resolveMcpCheckTarget("tools")).resolves.toEqual({
      url: "http://demo.localhost:8080/api/tools/mcp",
      resource: "tools",
    });
    expect(hostPorts.getHostPortPlan).toHaveBeenCalledWith("/project", { inspectDocker: false });
    expect(statusPorts.buildServicePorts).toHaveBeenCalledWith(tools, 8080);
  });

  it("falls back to no ingress port when the port plan cannot be read", async () => {
    const tools = makeResource("tools", "mcp");
    discovery.createDiscoveryContext.mockReturnValue({ resources: [tools] });
    hostPorts.getHostPortPlan.mockRejectedValue(new Error("no plan"));
    statusPorts.buildServicePorts.mockReturnValue({ url: "http://demo.localhost/api/tools" });

    await expect(resolveMcpCheckTarget("tools")).resolves.toMatchObject({
      url: "http://demo.localhost/api/tools/mcp",
    });
    expect(statusPorts.buildServicePorts).toHaveBeenCalledWith(tools, undefined);
  });

  it("fails outside a project", async () => {
    paths.findProjectRoot.mockReturnValue(null);
    await expect(resolveMcpCheckTarget("tools")).rejects.toThrow("Could not find project root");
    expect(discovery.createDiscoveryContext).not.toHaveBeenCalled();
  });

  it("fails for an unknown resource and suggests the closest name", async () => {
    discovery.createDiscoveryContext.mockReturnValue({
      resources: [makeResource("tools", "mcp")],
    });
    const error = await resolveMcpCheckTarget("tool").catch((e) => e);
    expect(error).toBeInstanceOf(FliskError);
    expect(error.message).toBe('Resource "tool" not found');
    expect(error.suggestions.join("\n")).toContain("tools");
  });

  it("fails for a resource with no HTTP route", async () => {
    discovery.createDiscoveryContext.mockReturnValue({
      resources: [makeResource("jobs", "worker")],
    });
    statusPorts.buildServicePorts.mockReturnValue({ url: null });
    const error = await resolveMcpCheckTarget("jobs").catch((e) => e);
    expect(error).toBeInstanceOf(FliskError);
    expect(error.message).toBe('Resource "jobs" has no HTTP route, so it cannot serve MCP');
    expect(error.exitCode).toBe(2);
  });
});

describe("flisk mcp check (in-process)", () => {
  beforeEach(() => {
    process.exitCode = 0;
    paths.findProjectRoot.mockReturnValue("/project");
    hostPorts.getHostPortPlan.mockResolvedValue({ ingressHttp: 8080 });
  });
  afterEach(() => {
    process.exitCode = 0;
    vi.clearAllMocks();
  });

  it("prints a passing report and passes the default options to the checker", async () => {
    checker.runMcpCheck.mockImplementation(async (url) => passingReport(url));

    const run = await runCheck(["https://mcp.example.com/mcp"]);

    expect(checker.runMcpCheck).toHaveBeenCalledWith("https://mcp.example.com/mcp", {
      call: false,
      icon: true,
      userAgent: "flisk-mcp-check/9.9.9 (+https://flisk.sh)",
    });
    expect(run.status).toBeUndefined();
    expect(process.exitCode).toBe(0);
    expect(run.stdout).toContain("MCP check: https://mcp.example.com/mcp");
    expect(run.stdout).toContain("Server: demo-server");
    expect(run.stdout).toMatch(/pass\s+initialize\s+protocol 2025-03-26/);
    expect(run.stdout).toMatch(/skip\s+tools\/call\s+pass --call to call tools/);
    expect(run.stdout).toContain("1 of 1 checks passed");
  });

  it("forwards --call and --no-icon, heads the report with the resource, and sets exit code 1 on failure", async () => {
    discovery.createDiscoveryContext.mockReturnValue({ resources: [makeResource("tools", "mcp")] });
    statusPorts.buildServicePorts.mockReturnValue({ url: "http://demo.localhost:8080/api/tools" });
    checker.runMcpCheck.mockImplementation(async (url) => failingReport(url));

    const run = await runCheck(["tools", "--call", "--no-icon"]);

    expect(checker.runMcpCheck).toHaveBeenCalledWith(
      "http://demo.localhost:8080/api/tools/mcp",
      expect.objectContaining({ call: true, icon: false }),
    );
    expect(run.stdout).toContain("MCP check: tools (http://demo.localhost:8080/api/tools/mcp)");
    expect(run.stdout).not.toContain("Server:");
    expect(run.stdout).toMatch(/FAIL\s+tools\/list\s+HTTP 500/);
    expect(run.stdout).toContain("1 of 2 checks passed, 1 failed");
    expect(process.exitCode).toBe(1);
  });

  it("prints the error and exits 2 when the target is refused", async () => {
    const run = await runCheck(["http://mcp.example.com/mcp"]);

    expect(run.status).toBe(2);
    expect(run.stderr.replace(ANSI, "")).toContain("needs an https URL");
    expect(checker.runMcpCheck).not.toHaveBeenCalled();
  });

  it("--json prints a passing envelope with the report and resource", async () => {
    checker.runMcpCheck.mockImplementation(async (url) => passingReport(url));

    const run = await runCheck(["https://mcp.example.com/mcp", "--json"]);
    const envelope = parseEnvelope(run.stdout) as {
      data: McpCheckReport & { resource: string | null };
      errors: unknown[];
    };

    expect(envelope.errors).toEqual([]);
    expect(envelope.data).toMatchObject({
      resource: null,
      url: "https://mcp.example.com/mcp",
      serverName: "demo-server",
      didPass: true,
      failures: 0,
    });
    expect(envelope.data.checks).toHaveLength(2);
    expect(process.exitCode).toBe(0);
  });

  it("--json reports MCP_CHECK_FAILED with one suggestion per failed check", async () => {
    checker.runMcpCheck.mockImplementation(async (url) => failingReport(url));

    const run = await runCheck(["https://mcp.example.com/mcp", "--json"]);
    const envelope = parseEnvelope(run.stdout) as {
      data: McpCheckReport;
      errors: Array<{ code: string; message: string; suggestions?: string[] }>;
    };

    expect(envelope.data.didPass).toBe(false);
    expect(envelope.errors).toEqual([
      {
        code: "MCP_CHECK_FAILED",
        message: "1 MCP check(s) failed for https://mcp.example.com/mcp",
        suggestions: ["tools/list: HTTP 500"],
      },
    ]);
    expect(process.exitCode).toBe(1);
  });

  it("--json writes a COMMAND_FAILED envelope and exits with the error's code when resolution fails", async () => {
    paths.findProjectRoot.mockReturnValue(null);

    const run = await runCheck(["tools", "--json"]);
    const envelope = parseEnvelope(run.stdout) as {
      data: unknown;
      errors: Array<{ code: string; message: string }>;
    };

    expect(run.status).toBe(1);
    expect(envelope.data).toBeNull();
    expect(envelope.errors[0]).toMatchObject({ code: "COMMAND_FAILED" });
    expect(envelope.errors[0]?.message).toContain("Could not find project root");
    expect(checker.runMcpCheck).not.toHaveBeenCalled();
  });
});
