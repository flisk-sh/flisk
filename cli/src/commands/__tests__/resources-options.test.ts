// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { resourcesCommand } from "../resources.js";
import { createTempProject, parseEnvelope, runFlisk } from "../../test-support/index.js";

function createStackProject(): string {
  return createTempProject({
    stacks: { app: { api: { appType: "backend", port: 4000 } } },
    resources: { worker: { appType: "worker", port: 6000 } },
  });
}

describe("resources --no-stack option wiring", () => {
  it("is a non-negated option with its own noStack key", () => {
    const option = resourcesCommand.options.find((o) => o.long === "--no-stack");
    expect(option?.negate).toBe(false);
    expect(option?.attributeName()).toBe("noStack");
    expect(option?.conflictsWith).toContain("stack");
  });
});

describe("resources stack filter options", () => {
  describe.each([false, true])("with json=%s", (json) => {
    it.each([
      ["--stack", "app", "--no-stack"],
      ["--no-stack", "--stack", "app"],
      ["-s", "app", "--no-stack"],
      ["--stack=app", "--no-stack"],
    ])("rejects conflicting filters %j as usage errors", (...args) => {
      const result = runFlisk(["resources", ...args, ...(json ? ["--json"] : [])], {
        cwd: createStackProject(),
      });

      expect(result.status).toBe(2);
      const message = json ? String(parseEnvelope(result.stdout).errors[0].message) : result.stderr;
      expect(message).toContain("--stack");
      expect(message).toContain("--no-stack");
      expect(message).toContain("cannot be used with");
      if (json) {
        expect(result.stderr).toBe("");
        expect(parseEnvelope(result.stdout)).toMatchObject({
          data: null,
          errors: [{ code: "USAGE" }],
        });
      } else {
        expect(result.stdout).toBe("");
      }
    });

    it.each([
      { args: ["--stack", "app"], included: "api", excluded: "worker" },
      { args: ["--no-stack"], included: "worker", excluded: "api" },
    ])("keeps the $args filter working alone", ({ args, included, excluded }) => {
      const result = runFlisk(["resources", ...args, ...(json ? ["--json"] : [])], {
        cwd: createStackProject(),
      });

      expect(result.status, result.stderr).toBe(0);
      if (json) {
        const envelope = parseEnvelope(result.stdout);
        expect(envelope.errors).toEqual([]);
        expect(envelope.data.resources.map((resource: { name: string }) => resource.name)).toEqual([
          included,
        ]);
      } else {
        expect(result.stdout).toContain(included);
        expect(result.stdout).not.toContain(excluded);
      }
    });
  });

  it.each(["--ports", "--verbose"])("documents %s as a text view option", (flag) => {
    const result = runFlisk(["resources", "--help"], { cwd: createStackProject() });

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(new RegExp(`${flag}[^\\n]*text view`));
    expect(result.stdout.replace(/\s+/g, " ")).toContain("JSON output is unchanged");
  });

  it.each([["--ports"], ["--verbose"], ["--ports", "--verbose"]])(
    "keeps JSON resource data unchanged with %j",
    (...args) => {
      const cwd = createStackProject();
      const baseline = runFlisk(["resources", "--json"], { cwd });
      const result = runFlisk(["resources", "--json", ...args], { cwd });

      expect(baseline.status).toBe(0);
      expect(result.status).toBe(0);
      expect(parseEnvelope(result.stdout)).toEqual(parseEnvelope(baseline.stdout));
    },
  );
});
