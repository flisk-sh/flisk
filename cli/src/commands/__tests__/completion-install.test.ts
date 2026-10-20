// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureExit, runCompletionCommand } from "../../test-support/index.js";

const home = vi.hoisted(() => ({ dir: "" }));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => home.dir };
});

interface CompletionOutput {
  stdout: string;
  stderr: string;
}

async function runCompletion(args: string[]): Promise<CompletionOutput> {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  try {
    await runCompletionCommand(args);
    return {
      stdout: log.mock.calls.map(([value]) => String(value)).join("\n"),
      stderr: error.mock.calls.map(([value]) => String(value)).join("\n"),
    };
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
}

const POWERSHELL_START = "# TDK-CLI-COMPLETION-START";
const POWERSHELL_END = "# TDK-CLI-COMPLETION-END";

describe("tdk completion --install and --output", () => {
  let workDir: string;
  let previousShell: string | undefined;
  let previousPsModulePath: string | undefined;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "tdk-completion-"));
    home.dir = join(workDir, "home");
    mkdirSync(home.dir, { recursive: true });
    previousShell = process.env.SHELL;
    previousPsModulePath = process.env.PSModulePath;
  });

  afterEach(() => {
    if (previousShell === undefined) {
      delete process.env.SHELL;
    } else {
      process.env.SHELL = previousShell;
    }
    if (previousPsModulePath === undefined) {
      delete process.env.PSModulePath;
    } else {
      process.env.PSModulePath = previousPsModulePath;
    }
    rmSync(workDir, { recursive: true, force: true });
  });

  it("writes the script to the --output path", async () => {
    const outputPath = join(workDir, "custom.bash");

    const { stdout } = await runCompletion(["bash", "--output", outputPath]);

    expect(readFileSync(outputPath, "utf-8")).toContain("# TDK CLI Bash Completion");
    expect(stdout).toContain("Written bash completion to:");
    expect(stdout).toContain(outputPath);
  });

  it("installs the bash script under ~/.bash_completion.d and prints the source line", async () => {
    const { stdout } = await runCompletion(["bash", "--install"]);

    const installPath = join(home.dir, ".bash_completion.d", "tdk-completion.bash");
    expect(readFileSync(installPath, "utf-8")).toContain("complete -F _tdk_completions tdk");
    expect(stdout).toContain("Installed bash completion to:");
    expect(stdout).toContain(installPath);
    expect(stdout).toContain("source ~/.bash_completion.d/tdk-completion.bash");
  });

  it("reuses an existing bash completion directory", async () => {
    mkdirSync(join(home.dir, ".bash_completion.d"), { recursive: true });

    await runCompletion(["bash", "--install"]);

    expect(existsSync(join(home.dir, ".bash_completion.d", "tdk-completion.bash"))).toBe(true);
  });

  it("installs the zsh script under ~/.zsh/completions and prints the fpath hint", async () => {
    const { stdout } = await runCompletion(["zsh", "--install"]);

    const installPath = join(home.dir, ".zsh", "completions", "_tdk");
    expect(readFileSync(installPath, "utf-8")).toContain("#compdef tdk");
    expect(stdout).toContain("Installed zsh completion to:");
    expect(stdout).toContain("fpath+=(~/.zsh/completions)");
    expect(stdout).toContain("compinit");
  });

  it("installs the fish script under ~/.config/fish/completions", async () => {
    const { stdout } = await runCompletion(["fish", "--install"]);

    const installPath = join(home.dir, ".config", "fish", "completions", "tdk.fish");
    expect(readFileSync(installPath, "utf-8")).toContain("complete -c tdk");
    expect(stdout).toContain("Installed fish completion to:");
    expect(stdout).toContain("Fish completions loaded automatically");
  });

  it("installs the PowerShell block into WindowsPowerShell when PowerShell 7 modules are absent", async () => {
    delete process.env.PSModulePath;

    const { stdout } = await runCompletion(["powershell", "--install"]);

    const installPath = join(
      home.dir,
      "Documents",
      "WindowsPowerShell",
      "Microsoft.PowerShell_profile.ps1",
    );
    const profile = readFileSync(installPath, "utf-8");
    expect(profile).toContain(POWERSHELL_START);
    expect(profile).toContain("Register-ArgumentCompleter -Native -CommandName tdk");
    expect(profile).toContain(POWERSHELL_END);
    expect(stdout).toContain("Installed powershell completion to:");
    expect(stdout).toContain("Close and reopen PowerShell");
  });

  it("installs the PowerShell block into the PowerShell 7 profile directory", async () => {
    process.env.PSModulePath = join("Documents", "PowerShell", "Modules");

    await runCompletion(["powershell", "--install"]);

    const installPath = join(
      home.dir,
      "Documents",
      "PowerShell",
      "Microsoft.PowerShell_profile.ps1",
    );
    expect(readFileSync(installPath, "utf-8")).toContain(POWERSHELL_START);
  });

  it("appends the PowerShell block to an existing profile that lacks a trailing newline", async () => {
    process.env.PSModulePath = "";
    const profileDir = join(home.dir, "Documents", "WindowsPowerShell");
    mkdirSync(profileDir, { recursive: true });
    const installPath = join(profileDir, "Microsoft.PowerShell_profile.ps1");
    writeFileSync(installPath, "Set-Alias ll Get-ChildItem", "utf-8");

    await runCompletion(["powershell", "--install"]);

    const profile = readFileSync(installPath, "utf-8");
    expect(profile.startsWith("Set-Alias ll Get-ChildItem\n")).toBe(true);
    expect(profile).toContain(POWERSHELL_START);
    expect(profile.trimEnd().endsWith(POWERSHELL_END)).toBe(true);
  });

  it("replaces an earlier PowerShell block instead of duplicating it", async () => {
    process.env.PSModulePath = "";
    const profileDir = join(home.dir, "Documents", "WindowsPowerShell");
    mkdirSync(profileDir, { recursive: true });
    const installPath = join(profileDir, "Microsoft.PowerShell_profile.ps1");
    writeFileSync(
      installPath,
      `Set-Alias ll Get-ChildItem\n${POWERSHELL_START}\nold block\n${POWERSHELL_END}\n`,
      "utf-8",
    );

    await runCompletion(["powershell", "--install"]);

    const profile = readFileSync(installPath, "utf-8");
    expect(profile).not.toContain("old block");
    expect(profile.split(POWERSHELL_START)).toHaveLength(2);
    expect(profile).toContain("Set-Alias ll Get-ChildItem");
  });

  it("exits with status 1 when --install is given an unsupported shell", async () => {
    const { expectExit, exit } = captureExit();

    try {
      await expect(runCompletion(["tcsh", "--install"])).rejects.toThrow("process.exit");
      expectExit(1);
    } finally {
      exit.mockRestore();
    }
  });
});
