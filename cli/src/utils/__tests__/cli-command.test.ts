// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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

/** A PATH that holds an executable `flisk`, so the command resolves the same way on every machine. */
function pathWithFlisk(): string {
  const dir = mkdtempSync(join(tmpdir(), "flisk-bin-"));
  const bin = join(dir, "flisk");
  writeFileSync(bin, "#!/bin/sh\n");
  chmodSync(bin, 0o755);
  return dir;
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
    const env = { PATH: process.env.PATH ?? "" };
    const dir = mkdtempSync(join(tmpdir(), "flisk-workspace-"));
    const step = readyNextStep(env, dir);
    if (isCommandOnPath("flisk", env)) {
      expect(step).toBe("Next: flisk project --yes");
    } else {
      expect(step).toContain("npm install -g @flisk-sh/flisk");
    }
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
    const dir = mkdtempSync(join(tmpdir(), "flisk-workspace-"));
    writeFileSync(join(dir, "notes.txt"), "hi");
    const step = readyNextStep({ PATH: pathWithFlisk() }, dir);
    expect(step).toContain("mkdir -p");
    expect(step).toContain("flisk project --yes");
    expect(step).toContain("flisk project example");
  });

  it("lets a project start in an empty folder", () => {
    const dir = mkdtempSync(join(tmpdir(), "flisk-workspace-"));
    expect(isEmptyWorkspace(dir)).toBe(true);
    const step = readyNextStep({ PATH: pathWithFlisk() }, dir);
    expect(step).toBe("Next: flisk project --yes");
  });

  it("suggests a workspace under Documents when the machine has one", () => {
    const home = mkdtempSync(join(tmpdir(), "flisk-home-"));
    mkdirSync(join(home, "Documents"));
    expect(suggestedWorkspace({ HOME: home })).toBe(join(home, "Documents", "flisk"));
    expect(suggestedWorkspace({ HOME: home })).toContain("flisk");
  });
});
