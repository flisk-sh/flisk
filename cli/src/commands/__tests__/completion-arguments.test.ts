// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { captureExit, runCompletionCommand } from "../../test-support/index.js";

interface CompletionOutput {
  stdout: string;
  stderr: string;
}

async function runCompletion(args: string[]): Promise<CompletionOutput> {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { exit } = captureExit();

  try {
    await runCompletionCommand(args);
    return {
      stdout: log.mock.calls.map(([value]) => String(value)).join("\n"),
      stderr: error.mock.calls.map(([value]) => String(value)).join("\n"),
    };
  } finally {
    log.mockRestore();
    error.mockRestore();
    exit.mockRestore();
  }
}

describe("tdk completion shell selection", () => {
  it("accepts the shell as a positional argument", async () => {
    const { stdout } = await runCompletion(["zsh"]);

    expect(stdout).toContain("#compdef tdk");
  });

  it("detects the current shell when none is supplied", async () => {
    const previousShell = process.env.SHELL;
    process.env.SHELL = "/bin/zsh";

    try {
      const { stdout, stderr } = await runCompletion([]);

      expect(stdout).toContain("#compdef tdk");
      expect(stderr).toContain("Using zsh completion");
    } finally {
      if (previousShell === undefined) {
        delete process.env.SHELL;
      } else {
        process.env.SHELL = previousShell;
      }
    }
  });

  it.each(["", "/bin/sh"])("falls back to bash for unsupported SHELL=%s", async (shell) => {
    const previousShell = process.env.SHELL;
    process.env.SHELL = shell;

    try {
      const { stdout, stderr } = await runCompletion([]);

      expect(stdout).toContain("# TDK CLI Bash Completion");
      expect(stderr).toContain("Using bash completion");
    } finally {
      if (previousShell === undefined) {
        delete process.env.SHELL;
      } else {
        process.env.SHELL = previousShell;
      }
    }
  });
});
