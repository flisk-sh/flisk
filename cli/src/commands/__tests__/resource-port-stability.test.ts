// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resourceCommand } from "../../commands/resource.js";
import { clearDiscoveryCache } from "../../utils/discovery-context.js";

const jsonOutput = vi.hoisted(() => ({ createJsonEmitter: vi.fn() }));
vi.mock("../../utils/json-output.js", () => ({ ...jsonOutput }));

const originalCwd = process.cwd();

describe("re-running resource creation (#4183)", () => {
  let tempDir: string;

  beforeEach(() => {
    clearDiscoveryCache();
    tempDir = mkdtempSync(join(tmpdir(), "flisk-resource-port-stability-"));
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
        optional_infra: {
          monitoring: false,
          elk: false,
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
    clearDiscoveryCache();
  });

  async function createBackend(args: string[] = []): Promise<string> {
    await resourceCommand.parseAsync(
      ["node", "flisk", "api", "--type", "backend", "--stack", "main", "--yes", ...args],
      { from: "node" },
    );
    const serviceJson = join(tempDir, "services", "main", "api", "service.json");
    clearDiscoveryCache();
    return serviceJson;
  }

  it("leaves service.json byte-identical on subsequent runs", async () => {
    const serviceJson = await createBackend();
    const first = readFileSync(serviceJson);

    for (let run = 0; run < 3; run++) {
      await createBackend();
      expect(readFileSync(serviceJson).equals(first)).toBe(true);
    }
  });

  it("still changes only the port when --port is passed on a re-run", async () => {
    const serviceJson = await createBackend();
    const first = JSON.parse(readFileSync(serviceJson, "utf-8")) as { port: number };

    await createBackend(["--port", "4100"]);

    const second = JSON.parse(readFileSync(serviceJson, "utf-8")) as Record<string, unknown>;
    expect(second.port).toBe(4100);
    expect({ ...second, port: first.port }).toEqual(first);
  });
});
