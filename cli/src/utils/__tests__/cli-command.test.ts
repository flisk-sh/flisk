// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

import {
  CLI_COMMAND,
  CLI_PACKAGE,
  isCommandOnPath,
  LEGACY_PACKAGE,
  readyNextStep,
} from "../cli-command.js";

describe("cli-command", () => {
  it("names the command and the package that installs it", () => {
    expect(CLI_COMMAND).toBe("flisk");
    expect(CLI_PACKAGE).toBe("@flisk-sh/flisk");
    expect(LEGACY_PACKAGE).toBe("@tdk-landscape/tdk-cli-core");
  });

  it("finds the command on PATH", () => {
    expect(isCommandOnPath("flisk", { PATH: "/usr/local/bin:/usr/bin" })).toBe(false);
    expect(isCommandOnPath("flisk", { PATH: process.env.PATH ?? "" })).toBe(
      isCommandOnPath("flisk"),
    );
  });

  it("points at the command when it is installed", () => {
    const step = readyNextStep({ PATH: process.env.PATH ?? "" });
    if (isCommandOnPath("flisk", { PATH: process.env.PATH ?? "" })) {
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
    expect(step).toContain("flisk project --yes");
    expect(step).not.toBe("Next: flisk project --yes");
  });
});
