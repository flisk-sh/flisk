// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resourceCommand } from "../../commands/resource.js";
import { captureExit } from "../../test-support/index.js";
import { clearDiscoveryCache } from "../../utils/discovery-context.js";

const jsonOutput = vi.hoisted(() => ({ createJsonEmitter: vi.fn() }));
vi.mock("../../utils/json-output.js", () => ({ ...jsonOutput }));

// Parallel `flisk resource` runs all scan the project before any of them writes its service.json (#4023). Freezing the
// scan at the empty project reproduces that in one process: every create sees no other resource.
vi.mock("../../utils/services.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/services.js")>()),
  discoverResources: () => [],
}));

const originalCwd = process.cwd();

describe("resource creates that scanned the project before another one wrote (#4023)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-parallel-ports-test-"));
    mkdirSync(join(tempDir, ".flisk"), { recursive: true });
    writeFileSync(
      join(tempDir, ".flisk", "project.json"),
      JSON.stringify({
        version: "1.0.0",
        project: { name: "test", version: "1.0.0" },
        phases: Object.fromEntries(
          ["pre_alpha", "alpha", "beta", "out_of_scope"].map((name) => [
            name,
            { name, description: "", enabledStacks: [] },
          ]),
        ),
        optional_infra: { monitoring: false, elk: false, golden_image: false, verdaccio: false },
        discovery: { paths: ["services/**"] },
      }),
    );
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
    clearDiscoveryCache();
  });

  async function createResource(name: string, args: string[] = []): Promise<number> {
    await resourceCommand.parseAsync(
      ["node", "flisk", name, "--type", "backend", "--stack", "shop", "--yes", ...args],
      { from: "node" },
    );
    const file = join(tempDir, "services", "shop", name, "service.json");
    return JSON.parse(readFileSync(file, "utf-8")).port;
  }

  it("gives each create its own port", async () => {
    const ports = [
      await createResource("race-a"),
      await createResource("race-b"),
      await createResource("race-c"),
    ];
    expect(new Set(ports).size).toBe(3);
  });

  it("refuses an explicit --port that another create already wrote", async () => {
    expect(await createResource("pinned-a", ["--port", "4400"])).toBe(4400);

    const errors: string[] = [];
    const error = vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
      errors.push(parts.map(String).join(" "));
    });
    const { exit } = captureExit();
    try {
      await createResource("pinned-b", ["--port", "4400"]).catch(() => {});
      expect(exit).toHaveBeenCalledWith(1);
      expect(errors.join("\n")).toContain("Port 4400 is already assigned to another resource.");
    } finally {
      error.mockRestore();
      exit.mockRestore();
    }
  });
});
