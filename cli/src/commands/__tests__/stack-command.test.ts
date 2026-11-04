// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureExit, parseEnvelope } from "../../test-support/index.js";
import * as commandHelpers from "../../utils/command-helpers.js";
import { clearDiscoveryCache } from "../../utils/discovery-context.js";
import { FliskError } from "../../utils/errors.js";
import * as promptUtils from "../../utils/prompt.js";
import { normalizeResourceNames, parseStackResourceConfig, stackCommand } from "../stack.js";

const originalCwd = process.cwd();
const originalIsTTY = process.stdin.isTTY;

describe("normalizeResourceNames", () => {
  it("trims whitespace and splits comma-separated resource names", () => {
    expect(normalizeResourceNames([" api , worker ", "  web  "])).toEqual(["api", "worker", "web"]);
  });

  it("removes duplicate names while preserving order", () => {
    expect(normalizeResourceNames(["api,worker", "api", " worker , db , api "])).toEqual([
      "api",
      "worker",
      "db",
    ]);
  });

  it("returns an empty array for empty or whitespace-only input", () => {
    expect(normalizeResourceNames([])).toEqual([]);
    expect(normalizeResourceNames(["", "   ", " , , "])).toEqual([]);
  });
});

describe("parseStackResourceConfig", () => {
  it("parses valid service.json content", () => {
    expect(parseStackResourceConfig('{"appName":"api","stack":"core"}', "service.json")).toEqual({
      appName: "api",
      stack: "core",
    });
  });

  it("throws FliskError with file path when JSON is invalid", () => {
    expect(() => parseStackResourceConfig("{invalid", "/tmp/api/service.json")).toThrow(FliskError);
  });
});

describe("stackCommand", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-stack-cmd-test-"));
    process.chdir(tempDir);
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    stackCommand.setOptionValue("resources", undefined);
    stackCommand.setOptionValue("list", false);
    stackCommand.setOptionValue("json", false);
    stackCommand.setOptionValue("yes", false);
    stackCommand.setOptionValue("ignoreVersion", false);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    rmSync(tempDir, { recursive: true, force: true });
    clearDiscoveryCache();
    vi.restoreAllMocks();
  });

  function setupProject(
    resources: Array<{ name: string; stack?: string; group?: string }> = [],
  ): Record<string, string> {
    mkdirSync(join(tempDir, ".flisk"), { recursive: true });
    writeFileSync(
      join(tempDir, ".flisk", "project.json"),
      JSON.stringify({
        version: "1.0.0",
        project: { name: "test-proj", version: "1.0.0" },
        discovery: { paths: ["services/**"] },
      }),
    );

    const paths: Record<string, string> = {};
    for (const r of resources) {
      const resourceDir = join(tempDir, "services", r.group ?? "main", r.name);
      mkdirSync(resourceDir, { recursive: true });
      const manifestPath = join(resourceDir, "service.json");
      writeFileSync(
        manifestPath,
        JSON.stringify(
          {
            schemaVersion: 1,
            appName: r.name,
            appType: "backend",
            runtime: "bun",
            ...(r.stack ? { stack: r.stack } : {}),
            port: 4100,
          },
          null,
          2,
        ),
      );
      paths[`${r.group ?? "main"}/${r.name}`] = manifestPath;
    }
    return paths;
  }

  function pinProjectVersion(version = "999.999.999"): void {
    const projectJsonPath = join(tempDir, ".flisk", "project.json");
    const project = JSON.parse(readFileSync(projectJsonPath, "utf-8"));

    project.pinnedFliskVersion = version;

    writeFileSync(projectJsonPath, JSON.stringify(project, null, 2));
  }

  it("rejects when run outside a Flisk project", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { exit } = captureExit();

    await expect(
      stackCommand.parseAsync(["node", "flisk", "--list"], { from: "node" }),
    ).rejects.toThrow();

    expect(exit).toHaveBeenCalledWith(1);
  });

  it("emits COMMAND_FAILED JSON envelope when run outside a project with --json", async () => {
    let stdoutData = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutData += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { exit } = captureExit();

    await expect(
      stackCommand.parseAsync(["node", "flisk", "--list", "--json"], { from: "node" }),
    ).rejects.toThrow();

    expect(exit).toHaveBeenCalled();
    const envelope = parseEnvelope(stdoutData);
    expect(envelope.errors[0]?.code).toBe("COMMAND_FAILED");
  });

  it("rejects stack assignment when the CLI does not match pinnedFliskVersion", async () => {
    const paths = setupProject([{ name: "users-api" }]);
    pinProjectVersion();

    const manifestPath = paths["main/users-api"];

    if (!manifestPath) {
      throw new Error("Expected users-api fixture path");
    }
    const originalManifest = readFileSync(manifestPath, "utf-8");

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();

    await expect(
      stackCommand.parseAsync(["node", "flisk", "core", "--resources", "users-api", "--yes"], {
        from: "node",
      }),
    ).rejects.toThrow();

    expect(exit).toHaveBeenCalledWith(1);

    const output = errorSpy.mock.calls.flat().join("\n");

    expect(output).toContain("does not match pinnedFliskVersion 999.999.999");
    expect(output).toContain("npm install -g @flisk-sh/flisk@999.999.999");
    expect(originalManifest).toBe(readFileSync(manifestPath, "utf-8"));
  });

  it("allows stack assignment with --ignore-version", async () => {
    const paths = setupProject([{ name: "users-api" }]);
    pinProjectVersion();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await stackCommand.parseAsync(
      ["node", "flisk", "core", "--resources", "users-api", "--yes", "--ignore-version"],
      { from: "node" },
    );

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("--ignore-version"));

    const manifestPath = paths["main/users-api"];

    if (!manifestPath) {
      throw new Error("Expected users-api fixture path");
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(manifest.stack).toBe("core");
  });

  it("returns a JSON error when stack assignment is blocked by pinnedFliskVersion", async () => {
    const paths = setupProject([{ name: "users-api" }]);
    pinProjectVersion();

    const manifestPath = paths["main/users-api"];

    if (!manifestPath) {
      throw new Error("Expected users-api fixture path");
    }
    const originalManifest = readFileSync(manifestPath, "utf-8");

    let stdoutData = "";

    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutData += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const { exit } = captureExit();

    await expect(
      stackCommand.parseAsync(["node", "flisk", "core", "--resources", "users-api", "--json"], {
        from: "node",
      }),
    ).rejects.toThrow();

    expect(exit).toHaveBeenCalledWith(1);

    const envelope = parseEnvelope(stdoutData);

    expect(envelope.errors[0]?.message).toContain("does not match pinnedFliskVersion 999.999.999");

    expect(readFileSync(manifestPath, "utf-8")).toBe(originalManifest);
  });

  it("warns when no resources are discovered and --resources is not set", async () => {
    setupProject([]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await stackCommand.parseAsync(["node", "flisk", "--list"], { from: "node" });

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("No resources discovered.");
  });

  it("lists existing stacks and unassigned resources with --list", async () => {
    setupProject([{ name: "gateway", stack: "core" }, { name: "orders-api" }]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await stackCommand.parseAsync(["node", "flisk", "--list"], { from: "node" });

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Existing stacks:");
    expect(output).toContain("core");
    expect(output).toContain("1 resources without a stack:");
    expect(output).toContain("orders-api");
  });

  it("reports when all resources are already assigned to a stack with --list", async () => {
    setupProject([{ name: "gateway", stack: "core" }]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await stackCommand.parseAsync(["node", "flisk", "--list"], { from: "node" });

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("already assigned to a stack");
  });

  it("assigns resources to a valid stack name and updates service.json", async () => {
    const paths = setupProject([
      { name: "gateway", stack: "core" },
      { name: "users-api" },
      { name: "orders-api" },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await stackCommand.parseAsync(
      ["node", "flisk", "core", "--resources", "users-api,orders-api", "--yes"],
      { from: "node" },
    );

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Updated 2 resources.");
    expect(JSON.parse(readFileSync(paths["main/users-api"], "utf8")).stack).toBe("core");
    expect(JSON.parse(readFileSync(paths["main/orders-api"], "utf8")).stack).toBe("core");
  });

  it("returns updated stack counts and unassigned list in --json mode for a valid stack", async () => {
    setupProject([
      { name: "gateway", stack: "core" },
      { name: "users-api" },
      { name: "orders-api" },
    ]);
    let stdoutData = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutData += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await stackCommand.parseAsync(["node", "flisk", "core", "--resources", "users-api", "--json"], {
      from: "node",
    });

    const envelope = parseEnvelope(stdoutData);
    expect(envelope.data.stack).toBe("core");
    expect(envelope.data.stacks).toEqual([{ name: "core", resourceCount: 2 }]);
    expect(envelope.data.assigned.map((r: { name: string }) => r.name)).toEqual(["users-api"]);
    expect(envelope.data.unassigned.map((r: { name: string }) => r.name)).toEqual(["orders-api"]);
  });

  it("rejects an invalid stack name", async () => {
    setupProject([{ name: "users-api" }]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { exit } = captureExit();

    await expect(
      stackCommand.parseAsync(
        ["node", "flisk", "Invalid Stack!", "--resources", "users-api", "--yes"],
        { from: "node" },
      ),
    ).rejects.toThrow();

    expect(exit).toHaveBeenCalledWith(1);
    const errOutput = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(errOutput).toContain("Stack name");
  });

  it("rejects an unknown resource name and suggests valid resources", async () => {
    setupProject([{ name: "users-api" }, { name: "orders-api" }]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { exit } = captureExit();

    await expect(
      stackCommand.parseAsync(["node", "flisk", "backend", "--resources", "unknown-svc", "--yes"], {
        from: "node",
      }),
    ).rejects.toThrow();

    expect(exit).toHaveBeenCalledWith(1);
    const errOutput = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(errOutput).toContain('Resource "unknown-svc" not found');
    expect(errOutput).toContain("Valid resources: orders-api, users-api");
  });

  it("rejects empty --resources values", async () => {
    setupProject([{ name: "users-api" }]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { exit } = captureExit();

    await expect(
      stackCommand.parseAsync(["node", "flisk", "backend", "--resources", " , ", "--yes"], {
        from: "node",
      }),
    ).rejects.toThrow();

    expect(exit).toHaveBeenCalledWith(1);
    const errOutput = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(errOutput).toContain("Pass at least one resource name to --resources.");
  });

  it("rejects assignment when duplicate resource names exist across directories", async () => {
    setupProject([
      { name: "users-api", group: "a" },
      { name: "users-api", group: "b" },
    ]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { exit } = captureExit();

    await expect(
      stackCommand.parseAsync(["node", "flisk", "backend", "--resources", "users-api", "--yes"], {
        from: "node",
      }),
    ).rejects.toThrow();

    expect(exit).toHaveBeenCalledWith(1);
    const errOutput = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(errOutput).toContain("Cannot assign resources while duplicate names are present.");
  });

  it("rejects assigning a resource that already belongs to a stack", async () => {
    setupProject([{ name: "users-api", stack: "legacy" }]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { exit } = captureExit();

    await expect(
      stackCommand.parseAsync(["node", "flisk", "backend", "--resources", "users-api", "--yes"], {
        from: "node",
      }),
    ).rejects.toThrow();

    expect(exit).toHaveBeenCalledWith(1);
    const errOutput = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(errOutput).toContain('Resource "users-api" is already assigned to stack "legacy".');
  });

  it("supports interactive stack prompt, multi-select, and confirmation in a TTY", async () => {
    const paths = setupProject([{ name: "users-api" }]);
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    vi.spyOn(console, "log").mockImplementation(() => {});

    const promptTextSpy = vi.spyOn(promptUtils, "promptText").mockImplementation(async (opts) => {
      expect(opts.validate?.("valid-stack")).toBe(true);
      expect(typeof opts.validate?.("Invalid Stack")).toBe("string");
      return "interactive-stack";
    });
    const multiSelectSpy = vi
      .spyOn(promptUtils, "promptMultiSelect")
      .mockImplementation(async (opts) => {
        expect(opts.validate?.([])).toBe("Select at least one resource");
        expect(opts.validate?.([paths["main/users-api"]])).toBe(true);
        return [paths["main/users-api"]];
      });
    const confirmSpy = vi.spyOn(commandHelpers, "confirmOrCancel").mockResolvedValue(true);

    await stackCommand.parseAsync(["node", "flisk"], { from: "node" });

    expect(promptTextSpy).toHaveBeenCalledTimes(1);
    expect(multiSelectSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(paths["main/users-api"], "utf8")).stack).toBe(
      "interactive-stack",
    );
  });

  it("exits early without writing when confirmation is declined or no resources are available in a TTY", async () => {
    const paths = setupProject([{ name: "users-api" }]);
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    vi.spyOn(promptUtils, "promptMultiSelect").mockResolvedValue([paths["main/users-api"]]);
    vi.spyOn(commandHelpers, "confirmOrCancel").mockResolvedValue(false);

    await stackCommand.parseAsync(["node", "flisk", "backend"], { from: "node" });
    expect(JSON.parse(readFileSync(paths["main/users-api"], "utf8")).stack).toBeUndefined();

    vi.spyOn(promptUtils, "promptMultiSelect").mockResolvedValue([]);
    await stackCommand.parseAsync(["node", "flisk", "backend"], { from: "node" });
    expect(logSpy.mock.calls.map((c) => c.join(" ")).join("\n")).toContain(
      "No resources selected. Exiting.",
    );
  });
});
