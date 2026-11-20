// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { classifyUpFailure, type UpFailureInput, withUpFailureCodes } from "../up-failure-codes.js";

describe("classifyUpFailure", () => {
  it("maps exit code 127 to PROGRAM_NOT_FOUND and names the missing program", () => {
    const failure = classifyUpFailure({
      name: "shop-api",
      reason: "kept exiting",
      exitCode: 127,
      logs: ["> bun run --watch src/index.ts", "sh: bun: command not found"],
    });
    expect(failure).toMatchObject({
      code: "PROGRAM_NOT_FOUND",
      exitCode: 127,
      program: "bun",
      reason: "kept exiting (bun is not on PATH)",
      suggestions: [
        "Install bun so it is on PATH, then run `flisk up`",
        "Run `flisk doctor` to check your machine",
      ],
    });
  });

  it("names the program a preflight check already identified, even without logs", () => {
    const failure = classifyUpFailure({
      name: "api",
      reason: 'service "api" runs uv, which is not installed (not found on PATH).',
      exitCode: 127,
      program: "uv",
    });
    expect(failure.code).toBe("PROGRAM_NOT_FOUND");
    expect(failure.reason).toContain("uv, which is not installed");
    expect(failure.suggestions[0]).toContain("Install uv");
  });

  it("recognises the shell spellings used by Windows and /bin/sh", () => {
    expect(
      classifyUpFailure({ name: "api", reason: "'pnpm' is not recognized as an internal command" })
        .program,
    ).toBe("pnpm");
    expect(classifyUpFailure({ name: "api", reason: "/bin/sh: 1: sleep: not found" }).program).toBe(
      "sleep",
    );
    expect(classifyUpFailure({ name: "api", reason: "spawn uv ENOENT" }).program).toBe("uv");
  });

  it("classifies a crash loop and removes the pointer to output a JSON caller never saw", () => {
    const failure = classifyUpFailure({
      name: "api",
      reason: "kept exiting; see its output above",
      exitCode: 1,
      logs: ["FATAL: DATABASE_URL is not set"],
    });
    expect(failure.code).toBe("CRASH_LOOP");
    expect(failure.reason).toBe("kept exiting");
    expect(failure.reason).not.toContain("above");
    expect(failure.logs).toEqual(["FATAL: DATABASE_URL is not set"]);
    expect(failure.suggestions[0]).toContain("flisk logs --service api");
  });

  it("classifies a taken port without inventing an exit code", () => {
    const failure = classifyUpFailure({
      name: "api",
      reason: 'Port 4100 for service "api" is already in use by nginx (pid 77).',
    });
    expect(failure).toMatchObject({
      code: "PORT_IN_USE",
      exitCode: null,
      suggestions: expect.arrayContaining([expect.stringContaining("flisk down")]),
    });
  });

  it("classifies a failed health check from native and container-style messages alike", () => {
    const native = classifyUpFailure({
      name: "api",
      reason: "not ready after 30s (no answer from http://localhost:4100/health)",
    });
    const container = classifyUpFailure({
      name: "orders-api",
      reason: "health check is failing",
      message: "health check is failing",
    });
    expect(native.code).toBe("HEALTHCHECK_FAILED");
    expect(container.code).toBe("HEALTHCHECK_FAILED");
    expect(native.suggestions[0]).toContain("flisk logs --service api");
  });

  it("classifies a blocked dependent without calling it a crash", () => {
    const failure = classifyUpFailure({
      name: "web",
      reason: "not started: api did not start",
      exitCode: null,
    });
    expect(failure.code).toBe("DEPENDENCY_FAILED");
    expect(failure.suggestions[0]).toContain("flisk status");
  });

  it("falls back to UNKNOWN with a useful next command", () => {
    const failure = classifyUpFailure({ name: "api", reason: "something unusual happened" });
    expect(failure).toMatchObject({
      code: "UNKNOWN",
      exitCode: null,
      suggestions: expect.arrayContaining([expect.stringContaining("flisk doctor")]),
    });
  });

  it("derives an exit code from text when the runtime did not supply one", () => {
    expect(classifyUpFailure({ name: "api", reason: "exited with code 127" })).toMatchObject({
      code: "PROGRAM_NOT_FOUND",
      exitCode: 127,
    });
    expect(classifyUpFailure({ name: "api", reason: "Build failed: exit status 1" })).toMatchObject(
      {
        code: "CRASH_LOOP",
        exitCode: 1,
      },
    );
  });

  it("gives the same code to the same cause in local and Docker runtimes", () => {
    const local: UpFailureInput = {
      name: "api",
      reason: "kept exiting",
      exitCode: 127,
      logs: ["sh: bun: command not found"],
    };
    const docker: UpFailureInput = {
      name: "api",
      message: "Build failed: sh: bun: command not found",
      exitCode: 127,
    };
    expect(classifyUpFailure(local).code).toBe(classifyUpFailure(docker).code);
    expect(classifyUpFailure(docker).program).toBe("bun");
  });
});

describe("withUpFailureCodes", () => {
  it("classifies every entry and preserves existing fields", () => {
    const failures = withUpFailureCodes([
      { name: "api", reason: "kept exiting", fix: "Run flisk doctor", logs: ["boom"] },
      { name: "web", reason: "not started: api did not start" },
    ]);
    expect(failures.map((failure) => failure.code)).toEqual(["CRASH_LOOP", "DEPENDENCY_FAILED"]);
    expect(failures[0].fix).toBe("Run flisk doctor");
    expect(failures[0].logs).toEqual(["boom"]);
    expect(failures.every((failure) => typeof failure.exitCode !== "undefined")).toBe(true);
    expect(failures.every((failure) => failure.suggestions.length > 0)).toBe(true);
  });

  it("is idempotent when a failure was already classified", () => {
    const once = withUpFailureCodes([
      { name: "api", reason: "kept exiting; see its output above" },
    ]);
    const twice = withUpFailureCodes(once);
    expect(twice).toEqual(once);
  });
});
