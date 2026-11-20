// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { parseEnvelope, runFlisk } from "../../test-support/index.js";
import { formatDidYouMean, rewriteUnknownCommandMessage } from "../command-suggestions.js";

describe("rewriteUnknownCommandMessage (#4491)", () => {
  it("replaces misleading spelling suggestions with intent-based targets", () => {
    expect(
      rewriteUnknownCommandMessage(
        "error: unknown command 'ports'\n(Did you mean one of export, import?)\n",
      ),
    ).toBe("error: unknown command 'ports'\n(Did you mean networks?)\n");
    expect(rewriteUnknownCommandMessage("error: unknown command 'stop'")).toBe(
      "error: unknown command 'stop'\n(Did you mean down?)",
    );
    expect(
      rewriteUnknownCommandMessage(
        "error: unknown command 'start'\n(Did you mean one of restart, stack?)",
      ),
    ).toBe("error: unknown command 'start'\n(Did you mean up?)");
    expect(rewriteUnknownCommandMessage("error: unknown command 'services'")).toBe(
      "error: unknown command 'services'\n(Did you mean one of resources, status?)",
    );
    expect(rewriteUnknownCommandMessage("error: unknown command 'kill'")).toBe(
      "error: unknown command 'kill'\n(Did you mean down?)",
    );
    expect(rewriteUnknownCommandMessage("error: unknown command 'run'")).toBe(
      "error: unknown command 'run'\n(Did you mean up?)",
    );
  });

  it("leaves spelling-based suggestions intact for unmapped commands", () => {
    const nope = "error: unknown command 'nope'\n(Did you mean open?)";
    expect(rewriteUnknownCommandMessage(nope)).toBe(nope);
    const url = "error: unknown command 'url'\n(Did you mean urls?)";
    expect(rewriteUnknownCommandMessage(url)).toBe(url);
  });

  it("formats zero, one, or multiple suggestions cleanly", () => {
    expect(formatDidYouMean([])).toBe("");
    expect(formatDidYouMean(["networks"])).toBe("\n(Did you mean networks?)");
    expect(formatDidYouMean(["resources", "status"])).toBe(
      "\n(Did you mean one of resources, status?)",
    );
  });
});

describe("CLI unknown command suggestions (#4491)", () => {
  it("suggests networks instead of export/import for `flisk ports`", () => {
    const result = runFlisk(["ports"], { cwd: process.cwd() });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("error: unknown command 'ports'");
    expect(result.stderr).toContain("(Did you mean networks?)");
    expect(result.stderr).not.toContain("export");
  });

  it("includes mapped suggestions in `flisk ports --json`", () => {
    const result = runFlisk(["ports", "--json"], { cwd: process.cwd() });
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    const env = parseEnvelope(result.stdout);
    expect(env.errors).toHaveLength(1);
    expect((env.errors[0] as { suggestions?: string[] }).suggestions).toEqual([
      "Did you mean networks?",
    ]);
  });

  it("suggests down for `flisk stop|kill`, up for `flisk start`, and keeps spelling suggestions for typos", () => {
    for (const [command, target] of [
      ["stop", "down"],
      ["kill", "down"],
      ["start", "up"],
    ]) {
      const result = runFlisk([command], { cwd: process.cwd() });
      expect(result.status, `${command}: ${result.stderr}`).toBe(2);
      expect(result.stderr).toContain(`(Did you mean ${target}?)`);
    }

    // `run` is a real command (one-off command in a resource environment), so it never reaches the
    // unknown-command handler even though the synonym table lists it for future CLI variants.
    const runResult = runFlisk(["run"], { cwd: process.cwd() });
    expect(runResult.status).toBe(2);
    expect(runResult.stderr).toContain("missing required argument");

    const nopeResult = runFlisk(["nope"], { cwd: process.cwd() });
    expect(nopeResult.status).toBe(2);
    expect(nopeResult.stderr).toContain("(Did you mean open?)");
  });
});
