// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { pythonBackendProvider } from "../../backend-languages/python.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const exampleDir = join(
  repoRoot,
  "examples",
  "one-backend-python",
  "services",
  "one-backend-python",
  "api",
);

// The example is what `flisk resource api-backend --type backend --language python
// --stack one-backend-python` generates. If the Python provider changes, regenerate the example.
describe("examples/one-backend-python", () => {
  const generated = pythonBackendProvider.createFiles?.("api-backend") ?? [];

  it("generates files to compare against", () => {
    expect(generated.map((file) => file.filename).sort()).toEqual([
      "pyproject.toml",
      "src/main.py",
      "tests/test_health.py",
    ]);
  });

  for (const file of generated) {
    it(`${file.filename} matches the Python provider output`, () => {
      expect(readFileSync(join(exampleDir, file.filename), "utf-8")).toBe(file.content);
    });
  }

  it("declares the python provider and the routed health path", () => {
    const service = JSON.parse(readFileSync(join(exampleDir, "service.json"), "utf-8"));
    expect(service).toMatchObject({
      appName: "api-backend",
      appType: "backend",
      stack: "one-backend-python",
      language: "python",
      healthCheckPath: "/health",
    });
  });
});
