// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { networksCommand } from "../../commands/networks.js";
import { createServiceJson, resolveByoPort, resourceCommand } from "../../commands/resource.js";
import { resourcesCommand } from "../../commands/resources.js";
import { statusCommand } from "../../commands/status.js";
import { upCommand } from "../../commands/up.js";
import { captureExit } from "../../test-support/index.js";
import { VALID_RESOURCE_TYPES } from "../../utils/constants.js";

const jsonOutput = vi.hoisted(() => ({ createJsonEmitter: vi.fn() }));
vi.mock("../../utils/json-output.js", () => ({ ...jsonOutput }));

import { clearDiscoveryCache } from "../../utils/discovery-context.js";
import { discoverResourcesFromRoot, resetPrintedServiceWarnings } from "../../utils/services.js";

const originalCwd = process.cwd();

function snapshotTree(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) return [entryPath, ...snapshotTree(entryPath)];
    return [`${entryPath}:${readFileSync(entryPath, "utf-8")}`];
  });
}

describe("bring-your-own resource type", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-byo-test-"));
    mkdirSync(join(tempDir, ".tdk"), { recursive: true });
    writeFileSync(
      join(tempDir, ".tdk", "project.json"),
      JSON.stringify({
        version: "1.0.0",
        project: { name: "test", version: "1.0.0" },
        phases: Object.fromEntries(
          ["pre_alpha", "alpha", "beta", "out_of_scope"].map((name) => [
            name,
            { name, description: "", enabledStacks: [] },
          ]),
        ),
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
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  async function createByo(args: string[] = [], output?: string[]): Promise<string> {
    const originalLog = console.log;
    if (output) console.log = (...values: unknown[]) => output.push(values.join(" "));
    try {
      await resourceCommand.parseAsync(
        ["node", "flisk", "widget", "--type", "byo", "--stack", "shop", "--yes", ...args],
        { from: "node" },
      );
    } finally {
      if (output) console.log = originalLog;
    }
    return join(tempDir, "services", "shop", "widget");
  }

  function addResource(
    name: string,
    type: Parameters<typeof createServiceJson>[1],
    stack: string,
    port: number,
  ): void {
    const resourcePath = join(tempDir, "services", stack, name);
    mkdirSync(resourcePath, { recursive: true });
    writeFileSync(
      join(resourcePath, "service.json"),
      JSON.stringify(createServiceJson(name, type, stack, port), null, 2),
    );
    clearDiscoveryCache();
  }

  it("creates a discoverable service.json without scaffolding source", async () => {
    const resourcePath = await createByo();
    const service = JSON.parse(readFileSync(join(resourcePath, "service.json"), "utf-8"));

    expect(service).toMatchObject({
      appName: "widget",
      appType: "bring-your-own",
      stack: "shop",
      port: expect.any(Number),
      healthCheckPath: "/health",
      dockerfile: "./Dockerfile",
    });
    expect(service).not.toHaveProperty("exposeViaProxy");
    expect(service).not.toHaveProperty("restart");
    expect(existsSync(join(resourcePath, "src"))).toBe(false);
    expect(existsSync(join(resourcePath, "package.json"))).toBe(false);
    expect(existsSync(join(resourcePath, "tsconfig.json"))).toBe(false);
    expect(existsSync(join(resourcePath, "tests"))).toBe(false);
    expect(discoverResourcesFromRoot(tempDir).map((resource) => resource.name)).toContain("widget");
  });

  it("reports non-string route paths during service discovery", () => {
    addResource("invalid-api", "backend", "shop", 4000);
    addResource("invalid-frontend", "frontend", "shop", 5173);

    const writeField = (name: string, field: string, value: unknown) => {
      const path = join(tempDir, "services", "shop", name, "service.json");
      const service = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
      service[field] = value;
      writeFileSync(path, JSON.stringify(service, null, 2));
    };
    writeField("invalid-api", "apiPath", 42);
    writeField("invalid-frontend", "basePath", null);
    clearDiscoveryCache();
    resetPrintedServiceWarnings();

    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(discoverResourcesFromRoot(tempDir)).toEqual([]);
      const messages = warning.mock.calls.flat().map(String).join("\n");
      expect(messages).toContain("invalid-api");
      expect(messages).toContain("apiPath: expected a string");
      expect(messages).toContain("invalid-frontend");
      expect(messages).toContain("basePath: expected a string");
    } finally {
      warning.mockRestore();
      resetPrintedServiceWarnings();
    }
  });

  it("lists the resource through flisk resources and flisk up --dry-run", async () => {
    await createByo();
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => output.push(args.join(" "));

    try {
      await resourcesCommand.parseAsync(["node", "flisk", "--stack", "shop"], { from: "node" });
      expect(output.join("\n")).toContain("widget [shop]");

      output.length = 0;
      await resourcesCommand.parseAsync(["node", "flisk", "--stack", "shop", "--json"], {
        from: "node",
      });
      const resourcesReport = JSON.parse(output.join("\n"));
      expect(resourcesReport.schemaVersion).toBe(1);
      expect(resourcesReport.errors).toEqual([]);
      expect(resourcesReport.data.resources).toMatchObject([
        { name: "widget", stack: "shop", type: "bring-your-own" },
      ]);

      output.length = 0;
      await statusCommand.parseAsync(["node", "flisk", "--json"], { from: "node" });
      const statusReport = JSON.parse(output.join("\n"));
      expect(statusReport.schemaVersion).toBe(1);
      expect(statusReport.data.resources).toMatchObject([{ name: "widget", stack: "shop" }]);

      output.length = 0;
      await networksCommand.parseAsync(["node", "flisk", "--json"], { from: "node" });
      const networksReport = JSON.parse(output.join("\n"));
      expect(networksReport.schemaVersion).toBe(1);
      expect(networksReport.errors).toEqual([]);
      expect(networksReport.data.services).toEqual([]);

      output.length = 0;
      await networksCommand.parseAsync(["node", "flisk", "--json-legacy"], { from: "node" });
      expect(JSON.parse(output.join("\n"))).toEqual([]);

      output.length = 0;
      await upCommand.parseAsync(["node", "flisk", "shop", "--dry-run"], { from: "node" });
      expect(output.join("\n")).toContain('Would start 1 service from stack "shop"');
      expect(output.join("\n")).toContain("- widget");
    } finally {
      console.log = originalLog;
    }
  }, 15_000);

  it("lists routable services without basePath and honors path overrides", async () => {
    addResource("orders-api", "backend", "shop", 4000);
    addResource("legacy-api", "backend", "shop", 4100);
    addResource("storefront", "frontend", "shop", 5173);
    addResource("docs-mcp", "mcp", "shop", 3000);
    addResource("queue-worker", "worker", "shop", 6000);
    addResource("other-api", "backend", "other", 4200);

    const writeField = (name: string, field: string, value: string) => {
      const path = join(tempDir, "services", "shop", name, "service.json");
      const service = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
      service[field] = value;
      writeFileSync(path, JSON.stringify(service, null, 2));
    };
    writeField("legacy-api", "apiPath", "/api/v2/legacy");
    writeField("storefront", "basePath", "/web");
    clearDiscoveryCache();

    const output: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
      output.push(parts.map(String).join(" "));
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { exit } = captureExit();

    try {
      await networksCommand.parseAsync(["node", "flisk", "--stack", "shop", "--json"], {
        from: "node",
      });
      const report = JSON.parse(output.join("\n")) as {
        data: { services: Array<{ name: string; stack: string; basePath: string; url: string }> };
      };
      const services = report.data.services;
      expect(services.map((service) => service.name).sort()).toEqual([
        "docs-mcp",
        "legacy-api",
        "orders-api",
        "storefront",
      ]);

      const byName = new Map(services.map((service) => [service.name, service] as const));
      expect(byName.get("orders-api")).toMatchObject({ stack: "shop", basePath: "/api/orders" });
      expect(byName.get("orders-api")?.url).toMatch(/^http:\/\/api\..*\/api\/orders$/);
      expect(byName.get("legacy-api")).toMatchObject({ stack: "shop", basePath: "/api/v2/legacy" });
      expect(byName.get("legacy-api")?.url).toMatch(/^http:\/\/api\..*\/api\/v2\/legacy$/);
      expect(byName.get("storefront")).toMatchObject({ stack: "shop", basePath: "/web" });
      expect(byName.get("storefront")?.url).toMatch(/^http:\/\/app\..*\/web$/);
      expect(byName.get("docs-mcp")?.basePath).toBe("/api/docs-mcp");

      output.length = 0;
      clearDiscoveryCache();
      exit.mockClear();
      await networksCommand
        .parseAsync(["node", "flisk", "--stack", "shop", "--raw"], { from: "node" })
        .catch(() => {});
      const raw = output.join("\n");
      expect(exit).toHaveBeenCalledWith(0);
      expect(raw).toContain("/api/orders");
      expect(raw).toContain("/api/v2/legacy");
      expect(raw).toContain("/web");
      expect(raw).toContain("/api/docs-mcp");
      expect(raw).not.toContain("queue-worker");
      expect(raw).not.toContain("other-api");
    } finally {
      log.mockRestore();
      warn.mockRestore();
      exit.mockRestore();
      clearDiscoveryCache();
    }
  });

  it("filters text resource output by type", async () => {
    await createByo();
    addResource("orders-api", "backend", "shop", 4000);
    addResource("catalog-api", "backend", "catalog", 4100);
    addResource("queue-worker", "worker", "shop", 6000);
    addResource("unassigned-api", "backend", "", 4200);

    const output: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
      output.push(parts.map(String).join(" "));
    });
    try {
      clearDiscoveryCache();
      await resourcesCommand.parseAsync(["node", "flisk", "--type", "worker"], { from: "node" });
      const report = output.join("\n");
      expect(report).toContain("queue-worker [shop]");
      expect(report).not.toContain("orders-api");
      expect(report).not.toContain("catalog-api");
      expect(report).not.toContain("widget");
      expect(report).not.toContain("unassigned-api");
      expect(report).not.toContain("not assigned to any stack");
    } finally {
      log.mockRestore();
      clearDiscoveryCache();
    }
  });

  it("combines the type and stack filters in JSON output", async () => {
    await createByo();
    addResource("orders-api", "backend", "shop", 4000);
    addResource("catalog-api", "backend", "catalog", 4100);
    addResource("queue-worker", "worker", "shop", 6000);

    const output: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
      output.push(parts.map(String).join(" "));
    });
    try {
      clearDiscoveryCache();
      await resourcesCommand.parseAsync(
        ["node", "flisk", "--type", "backend", "--stack", "shop", "--json"],
        { from: "node" },
      );
      const report = JSON.parse(output.join("\n"));
      expect(report.data.resources).toHaveLength(1);
      expect(report.data.resources).toMatchObject([
        { name: "orders-api", stack: "shop", type: "backend" },
      ]);
    } finally {
      log.mockRestore();
      clearDiscoveryCache();
    }
  });

  it("prints an empty state when no resources match the selected type", async () => {
    await createByo();

    const output: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
      output.push(parts.map(String).join(" "));
    });
    try {
      clearDiscoveryCache();
      await resourcesCommand.parseAsync(["node", "flisk", "--type", "backend", "--stack", "shop"], {
        from: "node",
      });
      expect(output.join("\n")).toContain('No services found in stack "shop" with type "backend".');
    } finally {
      log.mockRestore();
      clearDiscoveryCache();
    }
  });

  it("lists valid resource types when the type filter is invalid", async () => {
    await createByo();
    const output: string[] = [];
    const errors: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
      output.push(parts.map(String).join(" "));
    });
    const error = vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
      errors.push(parts.map(String).join(" "));
    });
    const { exit } = captureExit();
    try {
      await resourcesCommand
        .parseAsync(["node", "flisk", "--type", "unknown"], { from: "node" })
        .catch(() => {});
      expect(exit).toHaveBeenCalledWith(1);
      const combined = [...output, ...errors].join("\n");
      expect(combined).toContain('Invalid resource type "unknown"');
      expect(combined).toContain(`Valid types: ${VALID_RESOURCE_TYPES.join(", ")}`);
    } finally {
      log.mockRestore();
      error.mockRestore();
      exit.mockRestore();
      clearDiscoveryCache();
    }
  });

  it("suggests a close service name for --only", async () => {
    await createByo();
    const originalAllowNativeWindows = process.env.TDK_ALLOW_NATIVE_WINDOWS;
    process.env.TDK_ALLOW_NATIVE_WINDOWS = "1";
    const errors: string[] = [];
    const error = vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
      errors.push(parts.map(String).join(" "));
    });
    const { exit } = captureExit();

    try {
      await upCommand
        .parseAsync(["node", "flisk", "--only", "widgt", "--dry-run"], { from: "node" })
        .catch(() => {});
      expect(exit).toHaveBeenCalledWith(2);
      expect(errors.join("\n")).toContain('Did you mean "widget"?');
    } finally {
      error.mockRestore();
      exit.mockRestore();
      if (originalAllowNativeWindows === undefined) delete process.env.TDK_ALLOW_NATIVE_WINDOWS;
      else process.env.TDK_ALLOW_NATIVE_WINDOWS = originalAllowNativeWindows;
      clearDiscoveryCache();
    }
  });

  it("refuses a malformed stack before aggregating it, so it cannot reach generated config", async () => {
    await createByo();
    addResource("other", "backend", "store", 4100);
    const malformedPath = join(tempDir, "services", "broken", "service");
    mkdirSync(malformedPath, { recursive: true });
    writeFileSync(
      join(malformedPath, "service.json"),
      JSON.stringify({
        ...createServiceJson("broken", "backend", "broken", 4200),
        stack: { toString: null, valueOf: null },
      }),
    );
    clearDiscoveryCache();

    const originalAllowNativeWindows = process.env.TDK_ALLOW_NATIVE_WINDOWS;
    process.env.TDK_ALLOW_NATIVE_WINDOWS = "1";
    const emitted: Array<{ data: Record<string, unknown>; errors?: unknown[] }> = [];
    jsonOutput.createJsonEmitter.mockReturnValue(((
      data: Record<string, unknown>,
      errors?: unknown[],
    ) => emitted.push({ data, errors })) as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();

    try {
      await upCommand
        .parseAsync(["node", "flisk", "--only", "missing", "--dry-run", "--json"], { from: "node" })
        .catch(() => {});

      // A non-string stack is an invalid service.json (GHSA-phgf-pww4-7jxc), so discovery stops before the --only check.
      expect(exit).toHaveBeenCalledWith(1);
      expect(error).toHaveBeenCalledWith(expect.stringContaining("Invalid service.json at"));
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("service.json.stack: expected a string"),
      );
    } finally {
      error.mockRestore();
      exit.mockRestore();
      jsonOutput.createJsonEmitter.mockReset();
      if (originalAllowNativeWindows === undefined) delete process.env.TDK_ALLOW_NATIVE_WINDOWS;
      else process.env.TDK_ALLOW_NATIVE_WINDOWS = originalAllowNativeWindows;
      clearDiscoveryCache();
    }
  });

  it("suggests close stack names for text filters", async () => {
    await createByo();
    const output: string[] = [];
    const errors: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
      output.push(parts.map(String).join(" "));
    });
    const error = vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
      errors.push(parts.map(String).join(" "));
    });
    const { exit } = captureExit();

    try {
      for (const command of [resourcesCommand, networksCommand]) {
        output.length = 0;
        errors.length = 0;
        exit.mockClear();
        clearDiscoveryCache();
        await command
          .parseAsync(["node", "flisk", "--stack", "shp"], { from: "node" })
          .catch(() => {});

        expect(exit).toHaveBeenCalledWith(1);
        const combined = [...output, ...errors].join("\n");
        expect(combined).toContain('Stack "shp" not found');
        expect(combined).toContain("flisk stacks");
        expect(combined).toContain('Did you mean "shop"?');
      }
    } finally {
      log.mockRestore();
      error.mockRestore();
      exit.mockRestore();
      clearDiscoveryCache();
    }
  });
  it("emits service suggestions separately in --only JSON errors", async () => {
    await createByo();
    const originalAllowNativeWindows = process.env.TDK_ALLOW_NATIVE_WINDOWS;
    process.env.TDK_ALLOW_NATIVE_WINDOWS = "1";
    const emitted: Array<{ data: Record<string, unknown>; errors?: unknown[] }> = [];
    const emit = (data: Record<string, unknown>, errors?: unknown[]) => {
      emitted.push({ data, errors });
    };
    jsonOutput.createJsonEmitter.mockReturnValue(emit as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();

    try {
      await upCommand
        .parseAsync(["node", "flisk", "--only", "widgt", "--dry-run", "--json"], { from: "node" })
        .catch(() => {});
      expect(emitted).toEqual([
        {
          data: { ok: false },
          errors: [
            {
              code: "UNKNOWN_SERVICE",
              message: "Unknown service widgt. Valid names: widget",
              suggestions: ['Did you mean "widget"?'],
            },
          ],
        },
      ]);
    } finally {
      error.mockRestore();
      exit.mockRestore();
      jsonOutput.createJsonEmitter.mockReset();
      if (originalAllowNativeWindows === undefined) delete process.env.TDK_ALLOW_NATIVE_WINDOWS;
      else process.env.TDK_ALLOW_NATIVE_WINDOWS = originalAllowNativeWindows;
      clearDiscoveryCache();
    }
  });

  it("emits stack suggestions in JSON errors from up", async () => {
    await createByo();
    const originalAllowNativeWindows = process.env.TDK_ALLOW_NATIVE_WINDOWS;
    process.env.TDK_ALLOW_NATIVE_WINDOWS = "1";
    const emitted: Array<{ data: Record<string, unknown>; errors?: unknown[] }> = [];
    const emit = (data: Record<string, unknown>, errors?: unknown[]) => {
      emitted.push({ data, errors });
    };
    jsonOutput.createJsonEmitter.mockReturnValue(emit as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();

    try {
      for (const args of [
        ["shp", "--dry-run", "--json"],
        ["shp", "--only", "widget", "--dry-run", "--json"],
      ]) {
        emitted.length = 0;
        exit.mockClear();
        clearDiscoveryCache();
        await upCommand.parseAsync(["node", "flisk", ...args], { from: "node" }).catch(() => {});
        expect(exit).toHaveBeenCalledWith(1);
        expect(emitted).toHaveLength(1);
        expect(emitted[0]?.data).toEqual({ ok: false });
        expect(emitted[0]?.errors?.[0]).toMatchObject({
          code: "COMMAND_FAILED",
          message: 'Stack "shp" not found',
          suggestions: expect.arrayContaining(['Did you mean "shop"?']),
        });
      }
    } finally {
      error.mockRestore();
      exit.mockRestore();
      jsonOutput.createJsonEmitter.mockReset();
      if (originalAllowNativeWindows === undefined) delete process.env.TDK_ALLOW_NATIVE_WINDOWS;
      else process.env.TDK_ALLOW_NATIVE_WINDOWS = originalAllowNativeWindows;
      clearDiscoveryCache();
    }
  });

  it("emits stack suggestions in JSON errors from resources and networks", async () => {
    await createByo();
    const output: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
      output.push(parts.map(String).join(" "));
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();

    try {
      for (const command of [resourcesCommand, networksCommand]) {
        output.length = 0;
        exit.mockClear();
        clearDiscoveryCache();
        await command
          .parseAsync(["node", "flisk", "--stack", "shp", "--json"], { from: "node" })
          .catch(() => {});
        expect(exit).toHaveBeenCalledWith(1);
        const report = output
          .map(
            (line) =>
              JSON.parse(line) as {
                errors: Array<{ code: string; message: string; suggestions?: string[] }>;
              },
          )
          .find((entry) => entry.errors[0]?.code === "COMMAND_FAILED");
        expect(report?.errors[0]).toMatchObject({
          code: "COMMAND_FAILED",
          message: 'Stack "shp" not found',
          suggestions: expect.arrayContaining(['Did you mean "shop"?']),
        });
      }
    } finally {
      log.mockRestore();
      error.mockRestore();
      exit.mockRestore();
      clearDiscoveryCache();
    }
  });

  it("keeps --dry-run side-effect free even when --force is also set", async () => {
    await createByo();
    const before = snapshotTree(tempDir);
    const originalTiltPort = process.env.TILT_PORT;
    delete process.env.TILT_PORT;

    try {
      await upCommand.parseAsync(["node", "flisk", "shop", "--dry-run", "--force", "--quiet"], {
        from: "node",
      });
      expect(snapshotTree(tempDir)).toEqual(before);
      expect(process.env.TILT_PORT).toBeUndefined();
    } finally {
      if (originalTiltPort === undefined) delete process.env.TILT_PORT;
      else process.env.TILT_PORT = originalTiltPort;
    }
  });

  it("creates a port-matched Dockerfile stub when none exists", async () => {
    const resourcePath = await createByo();
    const service = JSON.parse(readFileSync(join(resourcePath, "service.json"), "utf-8"));
    const dockerfile = readFileSync(join(resourcePath, "Dockerfile"), "utf-8");
    const healthConfig = readFileSync(join(resourcePath, "health.conf"), "utf-8");

    expect(dockerfile).toContain(`EXPOSE ${service.port}`);
    expect(healthConfig).toContain(`listen ${service.port}`);
  });

  it("uses --image without writing a Dockerfile", async () => {
    const resourcePath = await createByo(["--image", "nginx:alpine"]);
    const service = JSON.parse(readFileSync(join(resourcePath, "service.json"), "utf-8"));

    expect(service.image).toBe("nginx:alpine");
    expect(service).not.toHaveProperty("dockerfile");
    expect(existsSync(join(resourcePath, "Dockerfile"))).toBe(false);
  });

  it("does not overwrite an existing Dockerfile", async () => {
    const resourcePath = join(tempDir, "services", "shop", "widget");
    mkdirSync(resourcePath, { recursive: true });
    const dockerfilePath = join(resourcePath, "Dockerfile");
    const existingContent = "# Custom Dockerfile\nFROM ubuntu:latest\n";
    writeFileSync(dockerfilePath, existingContent);
    const existingAgents = "# Preserve these service instructions\n";
    writeFileSync(join(resourcePath, "AGENTS.md"), existingAgents);

    await createByo();

    expect(readFileSync(dockerfilePath, "utf-8")).toBe(existingContent);
    expect(readFileSync(join(resourcePath, "AGENTS.md"), "utf-8")).toBe(existingAgents);
  });

  it("supports a nested Dockerfile path, a custom port, and --no-proxy", async () => {
    const resourcePath = await createByo([
      "--dockerfile",
      "container/Dockerfile",
      "--port",
      "4550",
      "--no-proxy",
    ]);
    const service = JSON.parse(readFileSync(join(resourcePath, "service.json"), "utf-8"));

    expect(service.port).toBe(4550);
    expect(service.dockerfile).toBe("container/Dockerfile");
    expect(service.exposeViaProxy).toBe(false);
    expect(readFileSync(join(resourcePath, "container", "Dockerfile"), "utf-8")).toContain(
      "EXPOSE 4550",
    );
    expect(readFileSync(join(resourcePath, "container", "Dockerfile"), "utf-8")).toContain(
      "COPY container/health.conf",
    );
    expect(existsSync(join(resourcePath, "container", "health.conf"))).toBe(true);
  });

  it("stores --restart for one-shot jobs and leaves it out by default", async () => {
    const job = await createByo(["--restart", "no"]);
    expect(JSON.parse(readFileSync(join(job, "service.json"), "utf-8")).restart).toBe("no");
  });

  it("rejects an unknown --restart policy before creating the resource", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(createByo(["--restart", "sometimes"])).rejects.toThrow("exit");
      expect(errors.mock.calls.flat().join("\n")).toContain('Unknown --restart policy "sometimes"');
    } finally {
      exit.mockRestore();
      errors.mockRestore();
    }
    expect(existsSync(join(tempDir, "services", "shop", "widget"))).toBe(false);
  });

  it("prints and stores the requested custom port", async () => {
    const output: string[] = [];
    const resourcePath = await createByo(["--port", "4500"], output);
    const service = JSON.parse(readFileSync(join(resourcePath, "service.json"), "utf-8"));

    expect(output.join("\n")).toContain("Port: 4500");
    expect(service.port).toBe(4500);
  });

  it("rejects malformed, out-of-range, and conflicting custom ports", () => {
    expect(() => resolveByoPort("4550x", 4000, [])).toThrow(/integer from 4000 through 5999/);
    expect(() => resolveByoPort("3999", 4000, [])).toThrow(/integer from 4000 through 5999/);
    expect(() => resolveByoPort("4550", 4000, [{ config: { port: 4550 } }])).toThrow(
      /already assigned/,
    );
  });

  it("lists valid resources with a warning and keeps flisk up strict", async () => {
    await createByo();
    const badPath = join(tempDir, "services", "shop", "broken", "service.json");
    mkdirSync(dirname(badPath), { recursive: true });
    writeFileSync(badPath, "{ not json");

    const output: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
      output.push(parts.map(String).join(" "));
    });
    const warn = vi.spyOn(console, "warn").mockImplementation((...parts: unknown[]) => {
      warnings.push(parts.map(String).join(" "));
    });

    try {
      clearDiscoveryCache();
      await resourcesCommand.parseAsync(["node", "flisk"], { from: "node" });
      expect(output.join("\n")).toContain("widget [shop]");
      expect(warnings.join("\n")).toContain(badPath);
      expect(warnings.join("\n")).toContain("invalid JSON");

      clearDiscoveryCache();
      resetPrintedServiceWarnings();
      output.length = 0;
      warnings.length = 0;
      await statusCommand.parseAsync(["node", "flisk", "--json"], { from: "node" });
      const report = JSON.parse(output.join("\n"));
      expect(report.data.resources).toMatchObject([{ name: "widget", stack: "shop" }]);
      expect(warnings.join("\n")).toContain(badPath);
      expect(warnings.join("\n")).toContain("invalid JSON");

      const previousWindowsOverride = process.env.TDK_ALLOW_NATIVE_WINDOWS;
      process.env.TDK_ALLOW_NATIVE_WINDOWS = "1";
      const error = vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
        errors.push(parts.map(String).join(" "));
      });
      const { exit } = captureExit();
      try {
        clearDiscoveryCache();
        await upCommand
          .parseAsync(["node", "flisk", "--dry-run", "--quiet"], { from: "node" })
          .catch(() => {});
      } finally {
        error.mockRestore();
        exit.mockRestore();
        if (previousWindowsOverride === undefined) delete process.env.TDK_ALLOW_NATIVE_WINDOWS;
        else process.env.TDK_ALLOW_NATIVE_WINDOWS = previousWindowsOverride;
      }
      expect(errors.join("\n")).toContain(badPath);
    } finally {
      log.mockRestore();
      warn.mockRestore();
      clearDiscoveryCache();
    }
  });
});
