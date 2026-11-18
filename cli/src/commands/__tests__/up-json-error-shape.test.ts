// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it } from "vitest";
import { createTempProject, runFlisk } from "../../test-support/index.js";

/**
 * Every error a refused `flisk up --json` reports carries a suggestions array, and the arrays for
 * UNKNOWN_SERVICE and INVALID_WAIT_TIMEOUT name a fix, so a script gets the valid names and an
 * example without parsing the message text (#4522).
 */

const PROJECT = {
  projectJson: {
    name: "json-shape",
    version: "1.0.0",
    phases: { alpha: { name: "alpha", description: "", enabledStacks: ["app"] } },
  },
  stacks: {
    app: {
      api: { appType: "backend", schemaVersion: 1, port: 4000, command: "echo hi" },
      web: {
        appType: "frontend",
        schemaVersion: 1,
        port: 3000,
        command: "echo hi",
        profiles: ["tools"],
      },
    },
  },
};

let dir: string;

beforeEach(() => {
  dir = createTempProject(PROJECT);
});

/** The first envelope on stdout: a refused `--wait` also prints the emitter's exit fallback (#3848). */
function firstEnvelope(stdout: string): { errors: Array<Record<string, unknown>> } {
  const line = stdout.trim().split(/\r?\n/)[0] ?? "";
  return JSON.parse(line) as { errors: Array<Record<string, unknown>> };
}

/** One `flisk up --json` refusal, with the error entry it reports. */
function refusal(args: readonly string[]): Record<string, unknown> {
  const result = runFlisk(["up", "--json", ...args], { cwd: dir });
  const envelope = firstEnvelope(result.stdout);
  expect(envelope.errors).toHaveLength(1);
  return envelope.errors[0] as Record<string, unknown>;
}

describe("flisk up --json errors share one shape (#4522)", () => {
  it("suggests the valid services for an unknown --only name", () => {
    const error = refusal(["--only", "nope", "--dry-run"]);
    expect(error).toMatchObject({ code: "UNKNOWN_SERVICE" });
    expect(Array.isArray(error.suggestions)).toBe(true);
    expect((error.suggestions as string[]).length).toBeGreaterThan(0);
    expect(error.suggestions).toContain("Valid names: api, web");
    expect(error.message).toContain("Unknown service nope. Valid names: api, web");
  });

  it("suggests an example timeout for an invalid --wait-timeout", () => {
    const error = refusal(["--wait", "--wait-timeout", "0", "--dry-run"]);
    expect(error).toMatchObject({ code: "INVALID_WAIT_TIMEOUT" });
    expect(error.suggestions).toEqual(["Try: --wait-timeout 600"]);
    expect(error.message).toBe("--wait-timeout must be a whole number of seconds from 1 to 21600");
  });

  it("keeps the suggestions an unknown --profile already reports", () => {
    const error = refusal(["--profile", "nope", "--dry-run"]);
    expect(error).toMatchObject({ code: "UNKNOWN_PROFILE" });
    expect(error.suggestions).toEqual(["Profiles in this project: tools"]);
  });

  it("keeps the suggestions a rejected --env-file already reports", () => {
    // A missing file never reaches the CLI: Node reads --env-file itself before flisk runs. The
    // refusal is exercised with a file that exists but misses the keys the platform needs.
    dir = createTempProject({ ...PROJECT, files: { "partial.env": "" } });
    const error = refusal(["--env-file", "partial.env", "--dry-run"]);
    expect(error).toMatchObject({ code: "ENV_FILE_INVALID" });
    expect((error.suggestions as string[]).length).toBeGreaterThan(0);
  });

  it("carries suggestions on every error the --wait fallback envelope reports", () => {
    const result = runFlisk(["up", "--json", "--wait", "--wait-timeout", "0", "--dry-run"], {
      cwd: dir,
    });
    const envelopes = result.stdout
      .trim()
      .split(/\r?\n/)
      .map(
        (line) =>
          JSON.parse(line) as {
            errors: Array<Record<string, unknown>>;
          },
      );
    for (const envelope of envelopes) {
      for (const error of envelope.errors) {
        expect(Array.isArray(error.suggestions), `suggestions on ${error.code}`).toBe(true);
        expect((error.suggestions as string[]).length).toBeGreaterThan(0);
      }
    }
  });
});
