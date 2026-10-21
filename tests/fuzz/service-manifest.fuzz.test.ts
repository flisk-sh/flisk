// Copyright (c) 2026 Flisk contributors
// SPDX-License-Identifier: MIT
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateGeneratedStringFields } from "../../cli/src/utils/service-manifest.js";

// service.json comes from repositories the user may not have written. A line break in any value could add YAML keys
// (e.g. `privileged: true`) to the generated Docker Compose file (GHSA-phgf-pww4-7jxc). These properties hold for any input.

const BREAKS = ["\n", "\r", "\u0085", " ", " ", "\u0000", "\u001f", "\u007f"];
const FIELD = fc.stringMatching(/^[a-z][A-Za-z0-9]{0,11}$/).filter((key) => key !== "smoke");
const ANY_OBJECT = fc.dictionary(fc.string(), fc.jsonValue());

describe("validateGeneratedStringFields (fuzz)", () => {
  it("never throws, whatever JSON object it is given", () => {
    fc.assert(
      fc.property(ANY_OBJECT, (manifest) => {
        const errors = validateGeneratedStringFields(manifest, "service.json");
        expect(Array.isArray(errors)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it("reports a line break or control character in any top-level string value", () => {
    fc.assert(
      fc.property(
        FIELD,
        fc.string(),
        fc.constantFrom(...BREAKS),
        fc.string(),
        (key, head, brk, tail) => {
          const errors = validateGeneratedStringFields(
            { [key]: `${head}${brk}${tail}` },
            "service.json",
          );
          expect(errors.some((error) => error.startsWith(`service.json.${key}`))).toBe(true);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("reports a line break inside nested objects and arrays", () => {
    fc.assert(
      fc.property(FIELD, FIELD, fc.constantFrom(...BREAKS), (outer, inner, brk) => {
        const nested = validateGeneratedStringFields(
          { [outer]: { [inner]: [`a${brk}b`] } },
          "service.json",
        );
        expect(nested.length).toBeGreaterThan(0);
      }),
      { numRuns: 300 },
    );
  });

  it("reports a key that contains a line break", () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom(...BREAKS), fc.string(), (head, brk, tail) => {
        const errors = validateGeneratedStringFields(
          { [`${head}${brk}${tail}`]: "x" },
          "service.json",
        );
        expect(errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 300 },
    );
  });

  it("never echoes the hostile value back in its errors", () => {
    fc.assert(
      fc.property(FIELD, fc.constantFrom(...BREAKS), (key, brk) => {
        const payload = `${brk}    privileged: true`;
        const errors = validateGeneratedStringFields({ [key]: `x${payload}` }, "service.json");
        expect(errors.join("\n")).not.toContain("privileged");
      }),
      { numRuns: 300 },
    );
  });

  it("leaves smoke alone, because it is never written into generated config", () => {
    fc.assert(
      fc.property(fc.string(), (body) => {
        const errors = validateGeneratedStringFields(
          { smoke: { create: { body } } },
          "service.json",
        );
        expect(errors.filter((error) => error.startsWith("service.json.smoke"))).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });
});
