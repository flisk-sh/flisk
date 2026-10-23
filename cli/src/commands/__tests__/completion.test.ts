// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { captureExit, runCompletionCommand } from "../../test-support/index.js";
import { runtimeCommand } from "../runtime.js";

describe("flisk completion", () => {
  it.each(["bash", "zsh", "fish", "powershell"])(
    "generates a non-empty %s script with doctor and resource completions",
    async (shell) => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});

      try {
        await runCompletionCommand(["--shell", shell]);

        const script = log.mock.calls.map(([value]) => String(value)).join("\n");
        expect(script.trim()).not.toBe("");
        expect(script).toContain("doctor");
        expect(script).toContain("resource");
      } finally {
        log.mockRestore();
      }
    },
  );

  it("reports an unsupported shell and exits with status 1", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { expectExit } = captureExit();

    try {
      await expect(runCompletionCommand(["--shell", "bogus"])).rejects.toThrow("process.exit");

      expect(error).toHaveBeenCalledWith(expect.stringContaining("Unsupported shell: bogus"));
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("Supported shells: bash, zsh, fish, powershell"),
      );
      expect(log).not.toHaveBeenCalled();
      expectExit(1);
    } finally {
      error.mockRestore();
      log.mockRestore();
    }
  });

  describe("JSON flags", () => {
    async function generate(shell: string): Promise<string> {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await runCompletionCommand(["--shell", shell]);
        return log.mock.calls.map(([value]) => String(value)).join("\n");
      } finally {
        log.mockRestore();
      }
    }

    it("runtime still has the --json option that the scripts complete", () => {
      expect(runtimeCommand.options.map((option) => option.long)).toContain("--json");
    });

    it("offers runtime --json in the bash script", async () => {
      expect(await generate("bash")).toMatch(/runtime\) options="[^"]*--json[^"]*"/);
    });

    it("offers runtime --json in the zsh script", async () => {
      expect(await generate("zsh")).toMatch(/runtime\)[\s\S]*?'--json\[/);
    });

    it("offers runtime --json in the fish script", async () => {
      expect(await generate("fish")).toContain(
        "complete -c flisk -f -n '__fish_seen_subcommand_from runtime' -l json",
      );
    });
  });
});
