// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { runCommandInProcess } from "../../test-support/run-in-process.js";
import { createTempProject } from "../../test-support/temp-project.js";

const promptMocks = vi.hoisted(() => ({
  promptSelect: vi.fn(),
  promptText: vi.fn(),
  promptConfirm: vi.fn(),
  promptMultiSelect: vi.fn(),
}));

vi.mock("../../utils/prompt.js", () => promptMocks);

const CLOSED_STDIN = "No input available to answer the prompt. Run this in a terminal.";

/** Runs the first resource of a fresh project, where the stack name is the only thing to ask. */
async function runFirstResource() {
  vi.resetModules();
  promptMocks.promptSelect.mockResolvedValue("hono");
  promptMocks.promptConfirm.mockResolvedValue(true);
  promptMocks.promptText.mockRejectedValue(new Error(CLOSED_STDIN));

  const { resourceCommand } = await import("../resource.js");
  const { clearDiscoveryCache } = await import("../../utils/discovery-context.js");
  const projectRoot = createTempProject();
  clearDiscoveryCache();
  return runCommandInProcess(resourceCommand, ["api", "--type", "backend"], projectRoot);
}

describe("first-resource stack prompt without a terminal", () => {
  it("names --stack and --yes in the closed-stdin error", async () => {
    const result = await runFirstResource();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(CLOSED_STDIN);
    expect(result.stderr).toContain("--stack <name>");
    expect(result.stderr).toContain("--yes");
  });
});
