// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDiscoveryCache } from "../../utils/discovery-context.js";
import { isTiltAvailable, runTilt } from "../../utils/tilt.js";
import { tiltGetUiResources } from "../../utils/up-readiness.js";
import { projectCommand } from "../project.js";
import { statusCommand } from "../status.js";

// `tdk project` refuses to start without Docker, Tilt and Bun on the machine,
// and `tdk status` asks Tilt whether it is installed. Neither is needed to
// check what status prints, so both are mocked.
vi.mock("../../utils/cold-preflight.js", () => ({
  assertMachineReadyOrExit: vi.fn(async () => {}),
}));
vi.mock("../../utils/tilt.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/tilt.js")>()),
  isTiltAvailable: vi.fn(),
  runTilt: vi.fn(),
}));

vi.mock("../../utils/up-readiness.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/up-readiness.js")>()),
  tiltGetUiResources: vi.fn(),
}));

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../..");

const FIXTURE_SERVICES = [
  { dir: "services/shop/orders-api", appName: "orders-api", appType: "backend", stack: "shop" },
  {
    dir: "services/shop/orders-web",
    appName: "orders-web",
    appType: "frontend",
    stack: "shop",
    dependsOn: ["orders-api"],
  },
  { dir: "services/billing/invoices", appName: "invoices", appType: "backend", stack: "billing" },
  { dir: "tools/report-job", appName: "report-job", appType: "backend" },
];

async function runStatus(args: string[] = []): Promise<string> {
  const lines: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    lines.push(parts.map(String).join(" "));
  });
  try {
    await statusCommand.parseAsync(args, { from: "user" });
  } finally {
    log.mockRestore();
  }
  if (!args.includes("--tilt")) expect(runTilt).not.toHaveBeenCalled();
  return stripVTControlCharacters(lines.join("\n"));
}

describe("tdk status", () => {
  const originalCwd = process.cwd();
  const originalExtensionSource = process.env.TDK_EXTENSION_SOURCE;
  let projectRoot = "";

  beforeAll(async () => {
    projectRoot = mkdtempSync(join(tmpdir(), "tdk-status-"));
    process.chdir(projectRoot);
    process.env.TDK_EXTENSION_SOURCE = repoRoot;

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await projectCommand.parseAsync(["--yes"], { from: "user" });
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }

    for (const { dir, ...manifest } of FIXTURE_SERVICES) {
      mkdirSync(join(projectRoot, dir), { recursive: true });
      writeFileSync(join(projectRoot, dir, "service.json"), JSON.stringify(manifest, null, 2));
    }
  }, 30000);

  afterAll(() => {
    process.chdir(originalCwd);
    if (originalExtensionSource === undefined) {
      delete process.env.TDK_EXTENSION_SOURCE;
    } else {
      process.env.TDK_EXTENSION_SOURCE = originalExtensionSource;
    }
    if (projectRoot.startsWith(tmpdir())) {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    clearDiscoveryCache();
    vi.mocked(isTiltAvailable).mockResolvedValue(true);
    vi.mocked(runTilt).mockReset();
    vi.mocked(tiltGetUiResources).mockReset().mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(isTiltAvailable).mockReset();
    vi.mocked(runTilt).mockReset();
    vi.mocked(tiltGetUiResources).mockReset();
  });

  it.each([
    [undefined, 10350],
    ["12345", 12345],
    ["12345abc", 10350],
    ["10350.5", 10350],
    ["0", 10350],
    ["-1", 10350],
    ["65536", 10350],
  ])("polls and reports the same port for TILT_PORT=%s", async (value, port) => {
    vi.stubEnv("TILT_PORT", value);
    const output = JSON.parse(await runStatus(["--json"]));
    expect(tiltGetUiResources).toHaveBeenCalledWith(port);
    expect(output.data.ports).toContainEqual({
      name: "tilt-ui",
      hostPort: port,
      purpose: "Tilt UI",
    });
  });

  it("prints Tilt availability, resource and stack counts, and next steps by default", async () => {
    const output = await runStatus();

    expect(output).toContain("TDK Status");
    expect(output).toContain("Tilt: available");
    expect(output).not.toContain("Install Tilt");
    expect(output).toContain("Resources: 4 discovered");
    expect(output).toContain("Stacks: 2 defined");
    expect(output).toMatch(/^ {2}billing: 1 resource$/m);
    expect(output).toMatch(/^ {2}shop: 2 resources$/m);
    expect(output.indexOf("billing:")).toBeLessThan(output.indexOf("shop:"));
    expect(output).toContain("1 resource not in any stack:");
    expect(output).toContain('Run "tdk stacks" to see all stacks.');
    expect(output).not.toContain("tdk list-stacks");
    expect(output).toContain('Run "tdk up <stack-name>" to start a stack.');

    // Resource names are only listed with --verbose.
    for (const { appName } of FIXTURE_SERVICES) {
      expect(output).not.toContain(appName);
    }
  });

  it("points to the Tilt install guide when Tilt is not installed", async () => {
    vi.mocked(isTiltAvailable).mockResolvedValue(false);

    const output = await runStatus();

    expect(output).toContain("Tilt: not found");
    expect(output).toContain("Install Tilt: https://docs.tilt.dev/install.html");
    expect(output).toContain("Resources: 4 discovered");
  });

  it("lists each stack's resources and the unassigned resources with --verbose", async () => {
    const output = await runStatus(["--verbose"]);

    expect(output).toMatch(/^ {2}billing: 1 resource\n {6}invoices$/m);
    expect(output).toMatch(/^ {2}shop: 2 resources\n {6}orders-api\n {6}orders-web$/m);
    expect(output).toMatch(/^1 resource not in any stack:\n {2}report-job$/m);
  });

  it("accepts the -v shorthand for --verbose", async () => {
    expect(await runStatus(["-v"])).toBe(await runStatus(["--verbose"]));
  });

  it("shows stacks by default, so --stacks prints the default output", async () => {
    expect(await runStatus(["--stacks"])).toBe(await runStatus());
  });

  it("prints the default summary with --resources", async () => {
    // The text report does not read --resources yet; its resource count line is
    // part of the default output. Update this test if the flag gains a listing.
    const output = await runStatus(["--resources"]);

    expect(output).toBe(await runStatus());
    expect(output).toContain("Resources: 4 discovered");
  });

  it("reports an empty project without stack lines", async () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), "tdk-status-empty-"));
    try {
      mkdirSync(join(emptyRoot, ".tdk"));
      writeFileSync(join(emptyRoot, ".tdk", "project.json"), "{}");
      process.chdir(emptyRoot);

      const output = await runStatus(["--verbose"]);

      expect(output).toContain("Resources: 0 discovered");
      expect(output).toContain("Stacks: 0 defined");
      expect(output).not.toContain("not in any stack");
    } finally {
      process.chdir(projectRoot);
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });

  it("prints one JSON envelope with stack and unassigned resource details", async () => {
    vi.mocked(isTiltAvailable).mockResolvedValue(false);

    const output = await runStatus(["--json"]);
    expect(output.trim().split(/\r?\n/)).toHaveLength(1);
    expect(JSON.parse(output)).toMatchObject({
      schemaVersion: 1,
      data: {
        tilt: { available: false, resourcesQueried: false, resources: null, readiness: null },
        resourceCount: 4,
        stacks: [
          { name: "billing", resourceCount: 1, resources: ["invoices"] },
          { name: "shop", resourceCount: 2, resources: ["orders-api", "orders-web"] },
        ],
        unassignedResources: ["report-job"],
      },
      errors: [],
    });
  });

  it("includes Tilt resource status in JSON when requested and available", async () => {
    vi.mocked(isTiltAvailable).mockResolvedValue(true);
    vi.mocked(tiltGetUiResources).mockResolvedValue(
      JSON.stringify({ items: [{ metadata: { name: "orders-api" } }] }),
    );

    const output = await runStatus(["--json", "--tilt"]);
    const envelope = JSON.parse(output);

    expect(output.trim().split(/\r?\n/)).toHaveLength(1);
    expect(envelope.data.tilt).toMatchObject({
      available: true,
      resourcesQueried: true,
      resources: { items: [{ metadata: { name: "orders-api" } }] },
    });
    // Resources come from the Tilt API on its port; `tilt get -f` does not exist and must not be called.
    expect(runTilt).not.toHaveBeenCalled();
    expect(envelope.errors ?? []).toEqual([]);
  });

  it("explains which port has no Tilt when --tilt is requested but nothing answers", async () => {
    vi.mocked(isTiltAvailable).mockResolvedValue(true);
    vi.mocked(tiltGetUiResources).mockResolvedValue(null);

    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
      lines.push(parts.map(String).join(" "));
    });
    try {
      // A status with errors exits non-zero; the JSON envelope is still printed first.
      await statusCommand.parseAsync(["--json", "--tilt"], { from: "user" }).catch(() => undefined);
    } finally {
      log.mockRestore();
    }
    // The status envelope comes first; vitest turns the following process.exit into an error that prints a second one.
    const envelope = JSON.parse(stripVTControlCharacters(lines.filter(Boolean)[0] ?? "{}"));
    expect(envelope.errors?.[0]).toMatchObject({ code: "TILT_STATUS_UNAVAILABLE" });
    expect(envelope.errors?.[0]?.message).toMatch(/No Tilt is answering on port \d+/);
    expect(runTilt).not.toHaveBeenCalled();
  });

  describe("service state from a running Tilt", () => {
    const tilt = (...items: Array<[string, string, string]>) =>
      JSON.stringify({
        items: items.map(([name, update, runtime]) => ({
          metadata: { name },
          status: { updateStatus: update, runtimeStatus: runtime },
        })),
      });
    // orders-api failed; orders-web depends on it and its own process is up.
    const apiDown = tilt(
      ["orders-api", "error", "none"],
      ["orders-web", "ok", "ok"],
      ["invoices", "ok", "ok"],
    );

    it("does not call a service ready when a dependency has failed, in JSON", async () => {
      vi.mocked(tiltGetUiResources).mockResolvedValue(apiDown);
      const output = await runStatus(["--json"]);
      const resources = JSON.parse(output).data.resources as Array<Record<string, unknown>>;
      const byName = Object.fromEntries(resources.map((r) => [r.name, r]));
      expect(byName["orders-api"]).toMatchObject({ status: "error" });
      expect(byName["orders-web"]).toMatchObject({
        status: "error",
        statusReason: "orders-api failed",
        blockedBy: ["orders-api"],
      });
      expect(byName.invoices).toMatchObject({ status: "ready" });
      expect(byName["report-job"]).toMatchObject({ status: "unknown" });
    });

    it("shows every service as unknown when no Tilt answers", async () => {
      const output = await runStatus(["--json"]);
      const resources = JSON.parse(output).data.resources as Array<{ status: string }>;
      expect(resources.map((r) => r.status)).toEqual(["unknown", "unknown", "unknown", "unknown"]);
    });

    it("lists service states in the human output and names the failed dependency", async () => {
      vi.mocked(tiltGetUiResources).mockResolvedValue(apiDown);
      const output = await runStatus();
      expect(output).toContain("Services:");
      expect(output).toContain("✗ orders-api  error");
      expect(output).toContain("✗ orders-web  error (orders-api failed)");
      expect(output).toContain("✓ invoices  ready");
    });

    it("prints no Services section when no Tilt answers", async () => {
      const output = await runStatus();
      expect(output).not.toContain("Services:");
    });
  });

  it("fails on the missing project before printing any status line", async () => {
    const outside = mkdtempSync(join(tmpdir(), "tdk-status-outside-"));
    process.chdir(outside);
    clearDiscoveryCache();
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
      lines.push(parts.map(String).join(" "));
    });
    const errors: string[] = [];
    const err = vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
      errors.push(parts.map(String).join(" "));
    });
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);
    try {
      await statusCommand.parseAsync([], { from: "user" }).catch(() => {});
    } finally {
      log.mockRestore();
      err.mockRestore();
      exit.mockRestore();
      process.chdir(projectRoot);
      rmSync(outside, { recursive: true, force: true });
    }

    const stdout = stripVTControlCharacters(lines.join("\n"));
    expect(stdout).not.toContain("TDK Status");
    expect(stdout).not.toContain("Tilt:");
    expect(stripVTControlCharacters(errors.join("\n"))).toContain("Could not find project root");
  });
});
