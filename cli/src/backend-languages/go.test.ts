// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { goBackendProvider } from "./go.js";

function generatedFile(filename: string): string {
  const file = (goBackendProvider.createFiles?.("test-app") ?? []).find(
    (entry) => entry.filename === filename,
  );
  if (!file) throw new Error(`missing generated file ${filename}`);
  return file.content;
}

describe("Go backend port handling", () => {
  it("validates PORT before listening and defaults to 3000 on invalid values", () => {
    const source = generatedFile("main.go");
    expect(source).toContain('"strconv"');
    expect(source).toContain("func portFromEnv() string {");
    expect(source).toContain("strconv.Atoi(port)");
    expect(source).toContain("err != nil || number < 1 || number > 65535");
    expect(source).toContain('return "3000"');
    expect(source).toContain("port := portFromEnv()");
  });

  it("generates regression cases for malformed, out-of-range, and valid port values", () => {
    const tests = generatedFile("main_test.go");
    expect(tests).toContain("func TestPortFromEnv(t *testing.T)");
    for (const value of ['"abc"', '"70000"', '"0"', '"-1"', '"3000.5"']) {
      expect(tests).toContain(value);
    }
    expect(tests).toContain('t.Setenv("PORT", tt.value)');
  });
});
