// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runCompletionCommand } from "../../test-support/index.js";

const hasZsh = spawnSync("zsh", ["-fc", "true"]).status === 0;

// compinit autoloads `_flisk` from fpath, and zsh runs the file as the body of that function.
// A file that only defines `_flisk` returns on the first TAB without completing anything.
describe.skipIf(!hasZsh)("flisk zsh completion file", () => {
  let dir: string;

  beforeAll(async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await runCompletionCommand(["--shell", "zsh"]);
      dir = mkdtempSync(join(tmpdir(), "flisk-zsh-"));
      writeFileSync(join(dir, "_flisk"), log.mock.calls.map(([value]) => String(value)).join("\n"));
    } finally {
      log.mockRestore();
    }
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // Stubs record what the completion system would have been asked to do.
  function runZsh(body: string): string {
    const script = [
      'compdef() { print -r -- "compdef $*" }',
      "_arguments() { print -r -- completed }",
      `fpath=(${JSON.stringify(dir)} $fpath)`,
      body,
    ].join("\n");
    const result = spawnSync("zsh", ["-fc", script], { encoding: "utf-8" });
    expect(result.stderr).toBe("");
    return result.stdout;
  }

  it("completes on the first call after zsh autoloads it", () => {
    expect(runZsh("autoload -Uz _flisk\n_flisk")).toContain("completed");
  });

  it("registers the function with compdef when sourced", () => {
    const stdout = runZsh(`source ${JSON.stringify(join(dir, "_flisk"))}`);
    expect(stdout).toContain("compdef _flisk flisk");
    expect(stdout).not.toContain("completed");
  });
});
