// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { shellQuote } from "../doctor-runtime.js";

describe("shellQuote", () => {
  it.skipIf(process.platform === "win32")(
    "passes hostile values to the shell as a single literal argument",
    () => {
      const hostile = ["$(touch /tmp/pwned)", "`id`", 'a"; id; "b', "it's", "$HOME"];
      for (const value of hostile) {
        const out = execFileSync("sh", ["-c", `printf %s ${shellQuote(value)}`], {
          encoding: "utf-8",
        });
        expect(out).toBe(value);
      }
    },
  );
});
