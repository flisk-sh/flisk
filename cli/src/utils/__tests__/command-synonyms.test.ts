// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { COMMAND_SYNONYMS, enhanceUnknownCommandError } from "../command-synonyms.js";

describe("command-synonyms", () => {
  it("maps stop and kill to down, and start to up", () => {
    expect(COMMAND_SYNONYMS.stop).toBe("down");
    expect(COMMAND_SYNONYMS.kill).toBe("down");
    expect(COMMAND_SYNONYMS.start).toBe("up");
  });

  it("suggests flisk down for stop command", () => {
    const raw = "error: unknown command 'stop'\n";
    const enhanced = enhanceUnknownCommandError(raw);
    expect(enhanced).toContain("error: unknown command 'stop'");
    expect(enhanced).toContain('(Did you mean "flisk down"?)');
  });

  it("suggests flisk down for kill command", () => {
    const raw = "error: unknown command 'kill'\n";
    const enhanced = enhanceUnknownCommandError(raw);
    expect(enhanced).toContain("error: unknown command 'kill'");
    expect(enhanced).toContain('(Did you mean "flisk down"?)');
  });

  it("suggests flisk up for start command", () => {
    const raw = "error: unknown command 'start'\n(Did you mean one of restart, stack?)\n";
    const enhanced = enhanceUnknownCommandError(raw);
    expect(enhanced).toContain("error: unknown command 'start'");
    expect(enhanced).toContain('(Did you mean "flisk up"?)');
    expect(enhanced).not.toContain("restart, stack");
  });

  it("leaves standard typos untouched", () => {
    const raw = "error: unknown command 'dowm'\n(Did you mean down?)\n";
    const enhanced = enhanceUnknownCommandError(raw);
    expect(enhanced).toBe(raw);
  });

  it("leaves unrelated error messages untouched", () => {
    const raw = "error: missing required argument 'service'\n";
    const enhanced = enhanceUnknownCommandError(raw);
    expect(enhanced).toBe(raw);
  });
});
