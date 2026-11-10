// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { rustBackendProvider } from "./rust.js";

function generatedMain(): string {
  const file = (rustBackendProvider.createFiles?.("test-app") ?? []).find(
    (entry) => entry.filename === "src/main.rs",
  );
  if (!file) throw new Error("missing generated src/main.rs");
  return file.content;
}

describe("Rust backend port handling", () => {
  it("validates PORT as a nonzero u16 before binding, otherwise choosing 3000", () => {
    const main = generatedMain();
    expect(main).toContain("fn parse_port(value: &str) -> u16 {");
    expect(main).toContain("value.parse::<u16>()");
    expect(main).toContain(".filter(|port| *port != 0)");
    expect(main).toContain(".unwrap_or(3000)");
    expect(main).toContain('parse_port(&std::env::var("PORT").unwrap_or_default())');
  });

  it("generates regression cases for invalid and valid values", () => {
    const main = generatedMain();
    expect(main).toContain("fn port_validation()");
    for (const value of ['"abc"', '"70000"', '"0"', '"-1"', '"3000.5"']) {
      expect(main).toContain(value);
    }
    expect(main).toContain('assert_eq!(parse_port("3001"), 3001);');
  });
});
