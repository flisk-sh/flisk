// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";

const machine = vi.hoisted(() => ({ ready: vi.fn(async () => {}) }));

// The name is refused before the Windows refusal and the machine checks, so a test that
// reaches either of them fails instead of pretending the order is right.
vi.mock("../../utils/native-windows.js", () => ({
  nativeWindowsStackRefusal: () => undefined,
}));

vi.mock("../../utils/cold-preflight.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/cold-preflight.js")>()),
  assertMachineReadyOrExit: machine.ready,
}));

class ExitSignal extends Error {
  constructor(readonly code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

const originalArgv = process.argv;

/** Runs cli.ts from scratch with the given arguments and returns the exit code. */
async function runCli(...args: string[]): Promise<number | undefined> {
  vi.resetModules();
  process.argv = [originalArgv[0], "/fake/bin/flisk.js", ...args];

  try {
    await import("../../cli.js");
  } catch (error) {
    if (error instanceof ExitSignal) return error.code;
    throw error;
  }

  return undefined;
}

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
});

describe("flisk --template with an unknown name", () => {
  it("prints the template list and never starts the demo progress screen", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new ExitSignal(code);
    }) as never);
    machine.ready.mockClear();

    const code = await runCli("--template", "nope", "--project", "./t-nope");

    expect(code).toBe(1);
    const output = lines.join("\n");
    expect(output).toContain('Unknown template: "nope"');
    expect(output).toContain("Available templates:");
    expect(output).not.toContain("Demo folder");
    expect(output).not.toContain("Fetching the demo");
    expect(machine.ready).not.toHaveBeenCalled();
  });
});
