// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureExit } from "../../test-support/index.js";
import { clearDiscoveryCache } from "../../utils/discovery-context.js";

const promptMocks = vi.hoisted(() => ({
  promptSelect: vi.fn(),
  promptText: vi.fn(),
  promptConfirm: vi.fn(),
  promptMultiSelect: vi.fn(),
}));
vi.mock("../../utils/prompt.js", () => promptMocks);

const jsonOutput = vi.hoisted(() => ({ createJsonEmitter: vi.fn() }));
vi.mock("../../utils/json-output.js", () => ({ ...jsonOutput }));

const originalCwd = process.cwd();

// #4443: `flisk resource p3 --path "a b/c" --yes` creates the resource in a folder with a space and then prints
// `cd a b/c` as a next step, which fails when pasted into a shell (`cd: string not in pwd` in zsh, `too many
// arguments` in bash). The path is valid input, so the printed steps must work for it.
describe("resource next steps quote the cd path", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = realpathSync(mkdtempSync(join(tmpdir(), "flisk-next-steps-quote-test-")));
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

  async function runFreshResource(
    args: string[],
  ): Promise<{ logs: string[]; exitCode: number | undefined }> {
    vi.resetModules();
    const { resourceCommand } = await import("../../commands/resource.js");
    clearDiscoveryCache();

    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
      logs.push(parts.map(String).join(" "));
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();
    let exitCode: number | undefined;
    try {
      await resourceCommand
        .parseAsync(["node", "flisk", ...args], { from: "node" })
        .catch(() => {});
      exitCode = exit.mock.calls.at(-1)?.[0] as number | undefined;
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
      exit.mockRestore();
    }
    return { logs, exitCode };
  }

  it("quotes a path with a space in the printed cd step", async () => {
    const { logs, exitCode } = await runFreshResource([
      "p3",
      "--type",
      "backend",
      "--stack",
      "main",
      "--path",
      "a b/c",
      "--yes",
    ]);
    expect(exitCode, logs.join("\n")).toBeUndefined();
    expect(existsSync(join(tempDir, "a b/c", "service.json"))).toBe(true);
    const cdLines = logs.filter((line) => line.trim().startsWith("cd "));
    expect(cdLines).toContain('  cd "a b/c"');
    expect(cdLines).not.toContain("  cd a b/c");
  });

  it("leaves a plain path unquoted in the printed cd step", async () => {
    const { logs, exitCode } = await runFreshResource([
      "p4",
      "--type",
      "backend",
      "--stack",
      "main",
      "--path",
      "services/main/p4",
      "--yes",
    ]);
    expect(exitCode, logs.join("\n")).toBeUndefined();
    const cdLines = logs.filter((line) => line.trim().startsWith("cd "));
    expect(cdLines).toContain("  cd services/main/p4");
    expect(cdLines.some((line) => line.includes('"'))).toBe(false);
  });
});
