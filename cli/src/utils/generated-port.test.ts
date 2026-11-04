// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { portFromEnv } from "./generated-port.js";

// Runs the generated lines the way a generated backend does, with a fake process.env.
function portFor(PORT: string | undefined, name = "port"): unknown {
  const env = PORT === undefined ? {} : { PORT };
  return new Function("process", `${portFromEnv(name)}\nreturn ${name};`)({ env });
}

describe("portFromEnv", () => {
  it.each([
    ["8080", 8080],
    ["1", 1],
    ["65535", 65535],
  ])("uses PORT=%s", (value, expected) => {
    expect(portFor(value)).toBe(expected);
  });

  it.each([undefined, "", "abc", "70000", "65536", "0", "-1", "3000.5"])(
    "falls back to 3000 for PORT=%s",
    (value) => {
      expect(portFor(value)).toBe(3000);
    },
  );

  it("declares the requested name with the requested indent", () => {
    expect(portFor("abc", "PORT")).toBe(3000);
    expect(
      portFromEnv("port", "  ")
        .split("\n")
        .every((line) => line.startsWith("  const ")),
    ).toBe(true);
  });
});
