// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { ChildProcess } from "node:child_process";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureExit, parseEnvelope } from "../../test-support/index.js";
import { clearDiscoveryCache } from "../../utils/discovery-context.js";
import * as hostPortPlan from "../../utils/host-port-plan.js";
import * as portAssignment from "../../utils/port-assignment.js";
import { checkServiceStatus, determineDefaultDomain, networksCommand } from "../networks.js";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFileSync: vi.fn(),
    spawn: vi.fn(),
  };
});

function createMockChildProcess(options: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: Error;
}): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  child.stdout = new EventEmitter() as ChildProcess["stdout"];
  child.stderr = new EventEmitter() as ChildProcess["stderr"];

  queueMicrotask(() => {
    if (options.error) {
      child.emit("error", options.error);
      return;
    }
    if (options.stdout) {
      child.stdout?.emit("data", Buffer.from(options.stdout));
    }
    if (options.stderr) {
      child.stderr?.emit("data", Buffer.from(options.stderr));
    }
    child.emit("close", options.exitCode ?? 0);
  });

  return child;
}

const originalCwd = process.cwd();

describe("networksCommand and helpers", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-networks-test-"));
    process.chdir(tempDir);
    networksCommand.setOptionValue("stack", undefined);
    networksCommand.setOptionValue("json", false);
    networksCommand.setOptionValue("jsonLegacy", false);
    networksCommand.setOptionValue("raw", false);
    vi.spyOn(hostPortPlan, "createHostPortPlan").mockResolvedValue({
      ingressHttp: 80,
      ingressHttps: 443,
      postgres: 5432,
      requested: { ingressHttp: 80, ingressHttps: 443, postgres: 5432 },
      explicit: { ingressHttp: false, ingressHttps: false, postgres: false },
      reason: { ingressHttp: "default", ingressHttps: "default", postgres: "default" },
    });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
    clearDiscoveryCache();
    vi.restoreAllMocks();
  });

  function setupProject(
    projectName = "acme",
    resources: Array<{
      name: string;
      appType: string;
      stack?: string;
      port?: number;
      basePath?: string;
      apiPath?: string;
    }> = [],
  ): void {
    mkdirSync(join(tempDir, ".flisk"), { recursive: true });
    writeFileSync(
      join(tempDir, ".flisk", "project.json"),
      JSON.stringify({
        version: "1.0.0",
        project: { name: projectName, version: "1.0.0" },
        phases: {
          pre_alpha: { enabledStacks: [] },
          alpha: { enabledStacks: [] },
          beta: { enabledStacks: [] },
          out_of_scope: { enabledStacks: [] },
        },
        optional_infra: {
          monitoring: false,
          elk: false,
          debezium: false,
          golden_image: false,
          verdaccio: false,
        },
        discovery: { paths: ["services/**"] },
      }),
    );

    for (const r of resources) {
      const group = r.stack ?? "default";
      const resourceDir = join(tempDir, "services", group, r.name);
      mkdirSync(resourceDir, { recursive: true });
      writeFileSync(
        join(resourceDir, "service.json"),
        JSON.stringify(
          {
            schemaVersion: 1,
            appName: r.name,
            appType: r.appType,
            runtime: "bun",
            ...(r.stack ? { stack: r.stack } : {}),
            ...(r.port ? { port: r.port } : {}),
            ...(r.basePath ? { basePath: r.basePath } : {}),
            ...(r.apiPath ? { apiPath: r.apiPath } : {}),
          },
          null,
          2,
        ),
      );
    }
    clearDiscoveryCache();
  }

  describe("determineDefaultDomain", () => {
    it("returns <project>.localhost when project has a custom name", () => {
      setupProject("shopfront");
      expect(determineDefaultDomain()).toBe("shopfront.localhost");
    });

    it("scans Traefik Docker labels and prefers shortest project domain when project name is default", () => {
      setupProject("flisk-project");
      vi.mocked(childProcess.execFileSync).mockReturnValue(
        [
          "traefik.http.routers.fe.rule=Host(`myapp-api-frontend.localhost`)",
          "traefik.http.routers.app.rule=Host(`app.acme.localhost`) || Host(`acme.localhost`)",
        ].join("\n"),
      );

      expect(determineDefaultDomain()).toBe("acme.localhost");
    });

    it("extracts matching common project domain when only service-specific and common domains exist", () => {
      setupProject("flisk-project");
      vi.mocked(childProcess.execFileSync).mockReturnValue(
        "traefik.http.routers.fe.rule=Host(`myapp-api-frontend.localhost`)\ntraefik.http.routers. api.rule=Host(`myapp-core-backend.localhost`)",
      );

      expect(determineDefaultDomain()).toBe("localhost");
    });

    it("warns and falls back to localhost when the Docker command fails", () => {
      setupProject("flisk-project");
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(childProcess.execFileSync).mockImplementation(() => {
        throw new Error("Cannot connect to the Docker daemon");
      });

      expect(determineDefaultDomain()).toBe("localhost");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Could not scan Traefik domains (Docker unavailable)"),
      );
    });
  });

  describe("checkServiceStatus", () => {
    it("returns stopped for non-HTTP URLs without spawning curl", async () => {
      expect(await checkServiceStatus("orders-api", 4000, "ftp://acme.localhost/api")).toBe(
        "stopped",
      );
      expect(childProcess.spawn).not.toHaveBeenCalled();
    });

    it("returns running on 2xx/3xx HTTP status and stopped on 4xx/5xx/000 or curl error", async () => {
      vi.mocked(childProcess.spawn).mockImplementationOnce(() =>
        createMockChildProcess({ stdout: "200" }),
      );
      expect(await checkServiceStatus("web", 3000, "http://app.acme.localhost/")).toBe("running");

      vi.mocked(childProcess.spawn).mockImplementationOnce(() =>
        createMockChildProcess({ stdout: "401" }),
      );
      expect(await checkServiceStatus("web", 3000, "http://app.acme.localhost/")).toBe("running");

      vi.mocked(childProcess.spawn).mockImplementationOnce(() =>
        createMockChildProcess({ stdout: "403" }),
      );
      expect(await checkServiceStatus("web", 3000, "http://app.acme.localhost/")).toBe("running");

      vi.mocked(childProcess.spawn).mockImplementationOnce(() =>
        createMockChildProcess({ stdout: "502" }),
      );
      expect(await checkServiceStatus("web", 3000, "http://app.acme.localhost/")).toBe("stopped");

      vi.mocked(childProcess.spawn).mockImplementationOnce(() =>
        createMockChildProcess({ stdout: "000" }),
      );
      expect(await checkServiceStatus("web", 3000, "http://app.acme.localhost/")).toBe("stopped");

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(childProcess.spawn).mockImplementationOnce(() =>
        createMockChildProcess({ exitCode: 7, stderr: "Failed to connect" }),
      );
      expect(await checkServiceStatus("web", 3000, "http://app.acme.localhost/")).toBe("stopped");
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("HTTP check failed"));
    });

    it("falls back to port probe and Docker container check, handling Docker command failure", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      vi.spyOn(portAssignment, "checkPortStatus").mockResolvedValueOnce("running");
      expect(await checkServiceStatus("orders-api", 4000)).toBe("running");

      vi.spyOn(portAssignment, "checkPortStatus").mockResolvedValueOnce("unknown");
      vi.mocked(childProcess.spawn).mockImplementationOnce(() =>
        createMockChildProcess({ stdout: "flisk-orders-api\n" }),
      );
      expect(await checkServiceStatus("orders-api", 4000)).toBe("running");
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Could not check port 4000"));

      vi.spyOn(portAssignment, "checkPortStatus").mockResolvedValueOnce("stopped");
      vi.mocked(childProcess.spawn).mockImplementationOnce(() =>
        createMockChildProcess({ error: new Error("docker ENOENT") }),
      );
      expect(await checkServiceStatus("orders-api", 4000)).toBe("stopped");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Could not check Docker for orders-api"),
      );
    });
  });

  describe("networksCommand action", () => {
    it("prints empty message and exits 0 when there are no routable networks", async () => {
      setupProject("acme", [{ name: "worker", appType: "worker", stack: "core" }]);
      const lines: string[] = [];
      vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });
      const { exit } = captureExit();

      await expect(
        networksCommand.parseAsync(["node", "flisk"], { from: "node" }),
      ).rejects.toThrow();

      expect(exit).toHaveBeenCalledWith(0);
      expect(stripVTControlCharacters(lines.join("\n"))).toContain("No routable services found");
    });

    it("prints stack-specific empty message when a stack has no routable services", async () => {
      setupProject("acme", [{ name: "worker", appType: "worker", stack: "jobs" }]);
      const lines: string[] = [];
      vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });
      const { exit } = captureExit();

      await expect(
        networksCommand.parseAsync(["node", "flisk", "--stack", "jobs"], { from: "node" }),
      ).rejects.toThrow();

      expect(exit).toHaveBeenCalledWith(0);
      expect(stripVTControlCharacters(lines.join("\n"))).toContain(
        'No routable services found in stack "jobs"',
      );
    });

    it("lists a proxied bring-your-own service at its /api/<name> URL", async () => {
      setupProject("flisk-project", [{ name: "vote", appType: "bring-your-own", port: 80 }]);
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(childProcess.execFileSync).mockImplementation(() => {
        throw new Error("Docker daemon not running");
      });
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockChildProcess({ stdout: "200" }),
      );

      const lines: string[] = [];
      vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });

      await networksCommand.parseAsync(["node", "flisk"], { from: "node" });

      const output = stripVTControlCharacters(lines.join("\n"));
      expect(output).not.toContain("No routable services found");
      // With the trailing slash: the page's relative links only resolve under the prefix with it.
      expect(output).toContain("http://api.localhost:80/api/vote/");
    });

    it("lists a proxied bring-your-own service at its apiPath", async () => {
      setupProject("flisk-project", [
        { name: "vote", appType: "bring-your-own", port: 80, apiPath: "/ballots" },
      ]);
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(childProcess.execFileSync).mockImplementation(() => {
        throw new Error("Docker daemon not running");
      });
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockChildProcess({ stdout: "200" }),
      );

      const lines: string[] = [];
      vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });

      await networksCommand.parseAsync(["node", "flisk"], { from: "node" });

      const output = stripVTControlCharacters(lines.join("\n"));
      expect(output).toContain("http://api.localhost:80/ballots");
      expect(output).not.toContain("/api/vote");
    });

    it("renders two networks across stacks with running and stopped statuses and custom domain tip", async () => {
      setupProject("flisk-project", [
        { name: "web", appType: "frontend", stack: "shop", port: 5173, basePath: "/" },
        { name: "orders-api", appType: "backend", port: 4000 },
      ]);
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(childProcess.execFileSync).mockImplementation(() => {
        throw new Error("Docker daemon not running");
      });
      vi.mocked(childProcess.spawn).mockImplementation((_cmd, args) => {
        const urlArg = args[args.length - 1] ?? "";
        if (String(urlArg).includes("app.localhost")) {
          return createMockChildProcess({ stdout: "200" });
        }
        return createMockChildProcess({ stdout: "503" });
      });

      const lines: string[] = [];
      vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });

      await networksCommand.parseAsync(["node", "flisk"], { from: "node" });

      const output = stripVTControlCharacters(lines.join("\n"));
      expect(output).toContain("TRAEFIK NETWORKS");
      expect(output).toContain("SHOP STACK");
      expect(output).toContain("DEFAULT STACK");
      expect(output).toContain("http://app.localhost:80/");
      expect(output).toContain("http://api.localhost:80/api/orders");
      expect(output).toContain("[stopped]");
      expect(output).toContain("export FLISK_PUBLIC_HOST=flisk-project.localhost");
    });

    it("emits machine error envelope when --stack does not exist in --json mode", async () => {
      setupProject("acme", [{ name: "web", appType: "frontend", stack: "shop", port: 5173 }]);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { exit } = captureExit();

      await expect(
        networksCommand.parseAsync(["node", "flisk", "--stack", "missing", "--json"], {
          from: "node",
        }),
      ).rejects.toThrow();

      expect(exit).toHaveBeenCalledWith(1);
      const stdout = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const envelope = parseEnvelope(stdout);
      expect(envelope.errors[0]?.code).toBe("COMMAND_FAILED");
    });

    it("emits machine error envelope when run outside a project in --json mode", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { exit } = captureExit();

      await expect(
        networksCommand.parseAsync(["node", "flisk", "--json"], { from: "node" }),
      ).rejects.toThrow();

      expect(exit).toHaveBeenCalledWith(1);
      const stdout = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const envelope = parseEnvelope(stdout);
      expect(envelope.errors[0]?.code).toBe("COMMAND_FAILED");
    });

    it("outputs JSON envelope, legacy JSON array, and raw URLs", async () => {
      setupProject("acme", [
        { name: "web", appType: "frontend", stack: "shop", port: 5173, basePath: "/shop" },
        { name: "orders-api", appType: "backend", stack: "shop", port: 4000 },
      ]);
      vi.mocked(childProcess.spawn).mockImplementation(() =>
        createMockChildProcess({ stdout: "200" }),
      );

      const lines: string[] = [];
      vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });

      await networksCommand.parseAsync(["node", "flisk", "--stack", "shop", "--json"], {
        from: "node",
      });
      const jsonReport = JSON.parse(lines.join("\n"));
      expect(jsonReport.schemaVersion).toBe(1);
      expect(jsonReport.data.services).toHaveLength(2);

      lines.length = 0;
      networksCommand.setOptionValue("json", false);
      await networksCommand.parseAsync(["node", "flisk", "--stack", "shop", "--json-legacy"], {
        from: "node",
      });
      const legacyReport = JSON.parse(lines.join("\n"));
      expect(Array.isArray(legacyReport)).toBe(true);
      expect(legacyReport).toHaveLength(2);

      lines.length = 0;
      networksCommand.setOptionValue("jsonLegacy", false);
      const { exit } = captureExit();
      await expect(
        networksCommand.parseAsync(["node", "flisk", "--stack", "shop", "--raw"], {
          from: "node",
        }),
      ).rejects.toThrow();
      expect(exit).toHaveBeenCalledWith(0);
      expect(lines.join("\n")).toContain("http://app.acme.localhost:80/shop");
      expect(lines.join("\n")).toContain("http://api.acme.localhost:80/api/orders");
    });

    it("exits with error when --stack does not exist in interactive mode", async () => {
      setupProject("acme", [{ name: "web", appType: "frontend", stack: "shop", port: 5173 }]);
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { exit } = captureExit();

      await expect(
        networksCommand.parseAsync(["node", "flisk", "--stack", "missing"], { from: "node" }),
      ).rejects.toThrow();

      expect(exit).toHaveBeenCalledWith(1);
    });
  });
});
