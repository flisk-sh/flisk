// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { runCommandInProcess } from "../../test-support/run-in-process.js";
import { createTempProject } from "../../test-support/temp-project.js";
import { toMachineError } from "../../utils/machine-output.js";
import { resourceNoInputError } from "../resource.js";

const promptMocks = vi.hoisted(() => ({
  promptSelect: vi.fn(),
  promptText: vi.fn(),
  promptConfirm: vi.fn(),
  promptMultiSelect: vi.fn(),
}));

vi.mock("../../utils/prompt.js", () => promptMocks);

describe("resource no-input flag hint (issue 4345)", () => {
  it("names --stack <name> and --yes in the error and its suggestions", () => {
    const error = resourceNoInputError(
      new Error("No input available to answer the prompt. Run this in a terminal."),
    );

    expect(error.message).toContain("--stack <name>");
    expect(error.message).toContain("--yes");
    expect(error.suggestions.join(" ")).toContain("--stack <name>");
    expect(error.suggestions.join(" ")).toContain("--yes");
  });

  it("carries the same hint and exit code 1 into a JSON error envelope", () => {
    const error = resourceNoInputError(
      new Error("No input available to answer the prompt. Run this in a terminal."),
    );
    const { error: machine, exitCode } = toMachineError(error);

    expect(exitCode).toBe(1);
    expect(JSON.stringify(machine)).toContain("--stack <name>");
    expect(JSON.stringify(machine)).toContain("--yes");
  });

  it("prints --stack and --yes in the non-TTY text error", async () => {
    vi.resetModules();
    promptMocks.promptText.mockRejectedValue(
      new Error("No input available to answer the prompt. Run this in a terminal."),
    );

    const { resourceCommand: command } = await import("../resource.js");
    const { clearDiscoveryCache } = await import("../../utils/discovery-context.js");
    const projectRoot = createTempProject();
    clearDiscoveryCache();
    const result = await runCommandInProcess(command, ["api", "--type", "backend"], projectRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--stack <name>");
    expect(result.stderr).toContain("--yes");
  });
});
