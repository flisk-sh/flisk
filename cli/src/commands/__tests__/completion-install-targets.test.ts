// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCompletionCommand } from "../../test-support/index.js";

const home = vi.hoisted(() => ({ dir: "/fake/home" }));

const fsStore = vi.hoisted(() => ({
  files: new Map<string, string>(),
  writeError: null as Error | null,
  mkdirError: null as Error | null,
}));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => home.dir };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn((p: string) => fsStore.files.has(p)),
    mkdirSync: vi.fn(() => {
      if (fsStore.mkdirError) throw fsStore.mkdirError;
      return undefined;
    }),
    readFileSync: vi.fn((p: string): string => {
      const content = fsStore.files.get(p);
      if (content === undefined) {
        throw new Error(`ENOENT: no such file or directory: ${p}`);
      }
      return content;
    }),
    writeFileSync: vi.fn((p: string, content: unknown) => {
      if (fsStore.writeError) throw fsStore.writeError;
      fsStore.files.set(p, String(content));
    }),
  };
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

describe("tdk completion --install target selection (mocked fs)", () => {
  let previousShell: string | undefined;
  let previousPsModulePath: string | undefined;

  beforeEach(() => {
    fsStore.files.clear();
    fsStore.writeError = null;
    fsStore.mkdirError = null;
    vi.clearAllMocks();
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
  });

  it("installs the zsh script picked up from SHELL when no argument is given", async () => {
    process.env.SHELL = "/usr/bin/zsh";

    const { stdout } = await runCompletion(["--install"]);

    const installPath = join(home.dir, ".zsh", "completions", "_tdk");
    expect(fsStore.files.get(installPath)).toContain("#compdef tdk");
    expect(stdout).toContain("Installed zsh completion to:");
  });

  it("falls back to bash with a notice when SHELL is unset", async () => {
    delete process.env.SHELL;

    const { stderr } = await runCompletion(["--install"]);

    expect(stderr).toContain("Using bash completion");
    const installPath = join(home.dir, ".bash_completion.d", "tdk-completion.bash");
    expect(fsStore.files.get(installPath)).toContain("complete -F _tdk_completions tdk");
  });

  it("lets the --shell option pick the install target", async () => {
    const { stdout } = await runCompletion(["--shell", "fish", "--install"]);

    const installPath = join(home.dir, ".config", "fish", "completions", "tdk.fish");
    expect(fsStore.files.get(installPath)).toContain("complete -c tdk");
    expect(stdout).toContain("Installed fish completion to:");
  });

  it("overwrites an existing bash completion on reinstall", async () => {
    const installPath = join(home.dir, ".bash_completion.d", "tdk-completion.bash");
    const writeMock = vi.mocked(writeFileSync);

    await runCompletion(["bash", "--install"]);
    const first = fsStore.files.get(installPath);
    expect(first).toBeDefined();
    expect(first).toContain("complete -F _tdk_completions tdk");

    await runCompletion(["bash", "--install"]);

    const writes = writeMock.mock.calls.filter(([path]) => path === installPath);
    expect(writes).toHaveLength(2);
    expect(fsStore.files.get(installPath)).toBe(first);
  });

  it("surfaces a filesystem write failure instead of reporting success", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    fsStore.writeError = new Error("EACCES: permission denied");

    try {
      await expect(runCompletionCommand(["bash", "--install"])).rejects.toThrow(
        "EACCES: permission denied",
      );
      const printed = log.mock.calls.map(([value]) => String(value)).join("\n");
      expect(printed).not.toContain("Installed");
    } finally {
      log.mockRestore();
    }
  });

  it("surfaces a directory creation failure and writes nothing", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    fsStore.mkdirError = new Error("EACCES: permission denied, mkdir");

    try {
      await expect(runCompletionCommand(["bash", "--install"])).rejects.toThrow(
        "EACCES: permission denied, mkdir",
      );
      expect(writeFileSync).not.toHaveBeenCalled();
      const printed = log.mock.calls.map(([value]) => String(value)).join("\n");
      expect(printed).not.toContain("Installed");
    } finally {
      log.mockRestore();
    }
  });

  it("appends the completion block to an existing PowerShell profile, preserving its content", async () => {
    process.env.PSModulePath = join("Documents", "PowerShell", "Modules");
    const installPath = join(
      home.dir,
      "Documents",
      "PowerShell",
      "Microsoft.PowerShell_profile.ps1",
    );
    fsStore.files.set(installPath, "# my profile\nSet-Alias ll Get-ChildItem");

    const { stdout } = await runCompletion(["powershell", "--install"]);

    const written = fsStore.files.get(installPath);
    expect(written).toContain("# my profile");
    expect(written).toMatch(/Set-Alias ll Get-ChildItem\n# TDK-CLI-COMPLETION-START/);
    expect(written).toContain("Register-ArgumentCompleter -Native -CommandName tdk");
    expect(stdout).toContain("Installed powershell completion to:");
  });

  it("replaces an existing TDK block in the PowerShell profile instead of duplicating it", async () => {
    process.env.PSModulePath = join("Documents", "PowerShell", "Modules");
    const installPath = join(
      home.dir,
      "Documents",
      "PowerShell",
      "Microsoft.PowerShell_profile.ps1",
    );
    const stale = [
      "# my profile",
      "# TDK-CLI-COMPLETION-START",
      "Register-ArgumentCompleter -Native -CommandName tdk-old",
      "# TDK-CLI-COMPLETION-END",
      "# footer",
      "",
    ].join("\n");
    fsStore.files.set(installPath, stale);

    await runCompletion(["powershell", "--install"]);

    const written = fsStore.files.get(installPath);
    expect(written).toContain("# my profile");
    expect(written).toContain("# footer");
    expect(written).not.toContain("tdk-old");
    expect(written).toContain("Register-ArgumentCompleter -Native -CommandName tdk");
    expect(written?.match(/# TDK-CLI-COMPLETION-START/g)).toHaveLength(1);
    expect(written?.match(/# TDK-CLI-COMPLETION-END/g)).toHaveLength(1);

    // The whole profile is the user's lines around exactly the block a fresh install writes.
    fsStore.files.delete(installPath);
    await runCompletion(["powershell", "--install"]);
    const freshBlock = fsStore.files.get(installPath)?.replace(/\n$/, "");
    expect(freshBlock).toMatch(/^# TDK-CLI-COMPLETION-START\n[\s\S]+\n# TDK-CLI-COMPLETION-END$/);
    expect(written).toBe(`# my profile\n${freshBlock}\n# footer\n`);
  });
});
