// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../types/index.js";
import { TemplateEngine } from "../template-engine.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const hasTilt = spawnSync("tilt", ["version"], { encoding: "utf-8" }).status === 0;
if (process.env.TDK_REQUIRE_TILT === "1" && !hasTilt) {
  throw new Error("Tilt is required for the generated tech stack Starlark tests in CI.");
}

const config = {
  version: "1.0",
  project: { name: "tech-stack", version: "1.0.0" },
  discovery: { paths: ["services/*/*"] },
  optional_infra: {},
  phases: {
    pre_alpha: { name: "Pre-Alpha", description: "", enabledStacks: ["app"] },
    alpha: { name: "Alpha", description: "", enabledStacks: [] },
    beta: { name: "Beta", description: "", enabledStacks: [] },
    out_of_scope: { name: "Out of Scope", description: "", enabledStacks: [] },
  },
} as unknown as ProjectConfig;

const temporaryDirs: string[] = [];

/**
 * Runs the generated TILT_TECH_STACK.star in real Starlark. `fail(...)` carries the answer out, because tilt prints
 * it on stderr when the Tiltfile fails.
 */
function validate(configLiteral: string, strict: boolean, field: "errors" | "warnings"): string {
  const directory = mkdtempSync(join(tmpdir(), "tdk-tech-stack-"));
  temporaryDirs.push(directory);
  const engine = new TemplateEngine(join(repoRoot, "cli", "templates"));
  writeFileSync(
    join(directory, "TILT_TECH_STACK.star"),
    engine.generateAll(config)["TILT_TECH_STACK.star"],
  );
  writeFileSync(
    join(directory, "Tiltfile"),
    [
      'load("./TILT_TECH_STACK.star", "validate_tech_stack")',
      `r = validate_tech_stack(${configLiteral}, strict=${strict ? "True" : "False"})`,
      `fail("ANSWER=" + "|".join(r["${field}"]))`,
    ].join("\n"),
  );
  const result = spawnSync(
    "tilt",
    ["alpha", "tiltfile-result", "-f", join(directory, "Tiltfile")],
    {
      cwd: directory,
      encoding: "utf-8",
      timeout: 25000,
    },
  );
  const answer = /ANSWER=(.*)/.exec(`${result.stdout}${result.stderr}`);
  if (!answer) throw new Error(`Starlark did not return an answer: ${result.stderr}`);
  return answer[1] ?? "";
}

afterEach(() => {
  for (const directory of temporaryDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe.skipIf(!hasTilt)("generated tech stack validation messages", { timeout: 40_000 }, () => {
  it("formats the whole strict error, with the real value and the real platform standard", () => {
    const message = validate('{"runtime": "definitely-not-a-runtime"}', true, "errors");
    expect(message).toMatch(
      /^❌ Tech Stack Error: runtime: 'definitely-not-a-runtime' is not supported\. Platform standard is '[^'{}]+'\. Use _override_reason to document exceptions\.$/,
    );
    expect(message).not.toContain("{}");
  });

  it("formats the whole non-strict warning", () => {
    const message = validate('{"runtime": "definitely-not-a-runtime"}', false, "warnings");
    expect(message).toMatch(
      /^⚠️ Tech Stack Warning: runtime: 'definitely-not-a-runtime' is not standard\. Platform standard is '[^'{}]+'\.$/,
    );
    expect(message).not.toContain("{}");
  });

  it("formats the override and optional-check messages too", () => {
    const override = validate(
      '{"runtime": "x", "_override_reason": "legacy service"}',
      true,
      "warnings",
    );
    expect(override).toBe("Override active: runtime='x' (Reason: legacy service)");
    const optional = validate('{"linting": "definitely-not-a-linter"}', false, "warnings");
    expect(optional).toMatch(
      /^⚠️ Tech Stack Warning: linting: 'definitely-not-a-linter' differs from standard '[^'{}]+'\.$/,
    );
  });
});
