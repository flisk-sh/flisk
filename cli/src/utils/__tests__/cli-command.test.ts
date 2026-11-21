// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  CLI_COMMAND,
  CLI_PACKAGE,
  CLI_REPOSITORY,
  isCommandOnPath,
  isEmptyWorkspace,
  LEGACY_PACKAGE,
  readyNextStep,
  suggestedWorkspace,
} from "../cli-command.js";

/** A PATH that contains a `flisk` command, so the installed branch is deterministic. */
function pathWithFlisk(): NodeJS.ProcessEnv {
  const dir = mkdtempSync(join(tmpdir(), "flisk-bin-"));
  writeFileSync(join(dir, "flisk"), "#!/bin/sh\n");
  chmodSync(join(dir, "flisk"), 0o755);
  return { PATH: dir };
}

describe("cli-command", () => {
  it("names the command and the package that installs it", () => {
    expect(CLI_COMMAND).toBe("flisk");
    expect(CLI_PACKAGE).toBe("@flisk-sh/flisk");
    expect(CLI_REPOSITORY).toBe("https://github.com/flisk-sh/flisk");
    expect(LEGACY_PACKAGE).toBe("@tdk-landscape/tdk-cli-core");
  });

  it("finds the command on PATH", () => {
    expect(isCommandOnPath("flisk", { PATH: join(tmpdir(), "flisk-no-such-dir") })).toBe(false);
    expect(isCommandOnPath("flisk", { PATH: process.env.PATH ?? "" })).toBe(
      isCommandOnPath("flisk"),
    );
  });

  it("points at the command when it is installed", () => {
    const dir = mkdtempSync(join(tmpdir(), "flisk-workspace-"));
    expect(readyNextStep(pathWithFlisk(), dir)).toBe("Next: flisk project --yes");
  });

  it("tells an ephemeral run how to install the command", () => {
    const step = readyNextStep({ PATH: "/nonexistent" });
    expect(step).toContain("not on PATH");
    expect(step).toContain("npm install -g @flisk-sh/flisk");
    expect(step).toContain("npm uninstall -g @tdk-landscape/tdk-cli-core");
    expect(step).toContain("https://github.com/flisk-sh/flisk");
    expect(step).toContain("flisk project --yes");
    expect(step).not.toBe("Next: flisk project --yes");
  });

  it("suggests a project folder instead of the current one when the folder has files", () => {
    const platform = vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    try {
      const dir = mkdtempSync(join(tmpdir(), "flisk-workspace-"));
      writeFileSync(join(dir, "notes.txt"), "hi");
      const step = readyNextStep(pathWithFlisk(), dir);
      expect(step).toContain("mkdir -p");
      expect(step).toContain("flisk project --yes");
      expect(step).toContain("flisk project example");
    } finally {
      platform.mockRestore();
    }
  });

  it("prints PowerShell next steps on Windows instead of POSIX shell commands", () => {
    const platform = vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    try {
      const home = mkdtempSync(join(tmpdir(), "flisk-home-"));
      mkdirSync(join(home, "Documents"));
      const env = { ...pathWithFlisk(), HOME: home, USERPROFILE: home };
      const dir = mkdtempSync(join(tmpdir(), "flisk-workspace-"));
      writeFileSync(join(dir, "notes.txt"), "hi");
      const workspace = join(home, "Documents", "flisk");

      const step = readyNextStep(env, dir);

      expect(step).toContain(`New-Item -ItemType Directory -Force '${workspace}'`);
      expect(step).toContain(`Set-Location '${workspace}'`);
      expect(step).toContain("flisk project --yes");
      expect(step).not.toContain("mkdir -p");
      expect(step).not.toContain("&&");
    } finally {
      platform.mockRestore();
    }
  });

  it("lets a project start in an empty folder", () => {
    const dir = mkdtempSync(join(tmpdir(), "flisk-workspace-"));
    expect(isEmptyWorkspace(dir)).toBe(true);
    expect(readyNextStep(pathWithFlisk(), dir)).toBe("Next: flisk project --yes");
  });

  it("suggests a workspace under Documents when the machine has one", () => {
    const home = mkdtempSync(join(tmpdir(), "flisk-home-"));
    mkdirSync(join(home, "Documents"));
    expect(suggestedWorkspace({ HOME: home })).toBe(join(home, "Documents", "flisk"));
    expect(suggestedWorkspace({ HOME: home })).toContain("flisk");
  });
});
