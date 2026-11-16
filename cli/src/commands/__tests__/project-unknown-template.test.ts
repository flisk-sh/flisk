// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { exitUnknownTemplate } from "../project.js";

class ExitSignal extends Error {
  constructor(readonly code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

/** Refuses `name` and returns everything the command printed. */
function refuse(name: string): string {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new ExitSignal(code);
  }) as never);

  expect(() => exitUnknownTemplate(name)).toThrow(ExitSignal);
  return lines.join("\n");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("exitUnknownTemplate", () => {
  it("suggests the closest starter for a near miss", () => {
    const output = refuse("sas");

    expect(output).toContain('Did you mean "saas"?');
    expect(output).toContain("Available templates:");
  });

  it("prints no suggestion for a name with no close match", () => {
    const output = refuse("zzzz");

    expect(output).not.toContain("Did you mean");
    expect(output).toContain("Available templates:");
  });
});
