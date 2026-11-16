// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { parseEnvelope, runFlisk } from "../../test-support/index.js";

type UsageError = { code: string; message: string; suggestions?: string[] };

/** Runs flisk and returns the single USAGE error of its stdout envelope. */
function usageError(args: string[]): { status: number; stderr: string; error: UsageError } {
  const result = runFlisk(args, { cwd: process.cwd() });
  const envelope = parseEnvelope(result.stdout);
  expect(envelope.schemaVersion).toBe(1);
  expect(envelope.data).toBeNull();
  expect(envelope.errors).toHaveLength(1);
  return { status: result.status, stderr: result.stderr, error: envelope.errors[0] as UsageError };
}

describe("usage errors with --json return the envelope on stdout (#4246)", () => {
  it("an unknown command carries the did-you-mean hint as a suggestion", () => {
    const { status, stderr, error } = usageError(["nope", "--json"]);
    expect(status).toBe(1);
    expect(stderr).toBe("");
    expect(error.code).toBe("USAGE");
    expect(error.message).toBe("error: unknown command 'nope'");
    expect(error.suggestions).toEqual(["Did you mean open?"]);
  });

  it("an unknown subcommand of a command group does the same", () => {
    const { status, error } = usageError(["config", "verifyx", "--json"]);
    expect(status).toBe(1);
    expect(error.code).toBe("USAGE");
    expect(error.message).toBe("error: unknown command 'verifyx'");
    expect(error.suggestions).toEqual(["Did you mean verify?"]);
  });

  it("a missing required argument", () => {
    const { status, stderr, error } = usageError(["config", "explain", "--json"]);
    expect(status).toBe(1);
    expect(stderr).toBe("");
    expect(error.code).toBe("USAGE");
    expect(error.message).toBe("error: missing required argument 'file'");
    expect(error.suggestions).toBeUndefined();
  });

  it("an unknown option on a command without its own JSON routing", () => {
    const { status, error } = usageError(["doctor", "--json", "--bogus"]);
    expect(status).toBe(1);
    expect(error.message).toBe("error: unknown option '--bogus'");
  });

  it("an option whose value is missing", () => {
    const { status, error } = usageError(["up", "--json", "--only"]);
    expect(status).toBe(1);
    expect(error.message).toContain("argument missing");
  });
});

describe("usage errors without --json keep the plain text (#4246)", () => {
  it("an unknown command still prints the message and hint on stderr", () => {
    const result = runFlisk(["nope"], { cwd: process.cwd() });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("error: unknown command 'nope'");
    expect(result.stderr).toContain("(Did you mean open?)");
  });

  it("--json after -- belongs to the forwarded command, not to flisk", () => {
    const result = runFlisk(["nope", "--", "--json"], { cwd: process.cwd() });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("error: unknown command 'nope'");
  });

  it("--help with --json still prints help and exits 0", () => {
    const result = runFlisk(["config", "--help", "--json"], { cwd: process.cwd() });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: flisk config");
    expect(result.stdout).not.toContain('"schemaVersion"');
  });
});
