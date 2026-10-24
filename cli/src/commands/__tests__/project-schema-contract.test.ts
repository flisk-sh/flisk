// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv from "ajv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { repoRoot, runFlisk } from "./project-e2e-helpers.js";

const schema = JSON.parse(
  readFileSync(join(repoRoot, "engine", "schemas", "project-schema.json"), "utf-8"),
);
const validateProject = new Ajv({ allErrors: false, strict: false }).compile(schema);

// The project schema is only an editor hint: the CLI stays the runtime source of truth. This keeps the hint in step with the
// file `flisk project` really writes, the same way service-schema-contract.test.ts does for service.json.
describe("project-schema.json", () => {
  let projectRoot = "";
  let defaults: Record<string, unknown> = {};

  beforeAll(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "flisk-project-schema-"));
    runFlisk(["project", "--yes"], projectRoot);
    defaults = JSON.parse(readFileSync(join(projectRoot, ".flisk", "project.json"), "utf-8"));
  }, 30000);

  afterAll(() => {
    if (projectRoot.startsWith(tmpdir())) rmSync(projectRoot, { recursive: true, force: true });
  });

  const validate = (config: unknown) => {
    const valid = validateProject(config);
    return { valid, errors: validateProject.errors ?? [] };
  };

  it("accepts the default .flisk/project.json that flisk project writes", () => {
    const { valid, errors } = validate(defaults);
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it.each(schema.required as string[])("reports a missing required field: %s", (field) => {
    const { [field]: _removed, ...config } = defaults;

    const { valid, errors } = validate(config);

    expect(valid).toBe(false);
    expect(errors).toEqual([
      expect.objectContaining({
        keyword: "required",
        instancePath: "",
        params: { missingProperty: field },
      }),
    ]);
  });

  it.each([["abc"], ["1.3"], ["v1.3.80"], ["1.3.80-beta"]])(
    "rejects minFliskVersion %s with a pattern error",
    (minFliskVersion) => {
      const { valid, errors } = validate({ ...defaults, minFliskVersion });

      expect(valid).toBe(false);
      expect(errors).toEqual([
        expect.objectContaining({ keyword: "pattern", instancePath: "/minFliskVersion" }),
      ]);
    },
  );

  it("accepts a MAJOR.MINOR.PATCH minFliskVersion", () => {
    expect(validate({ ...defaults, minFliskVersion: "1.3.80" }).valid).toBe(true);
  });
});
