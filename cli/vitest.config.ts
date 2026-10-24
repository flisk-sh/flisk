// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Project-level suites (generated output in tests/generated, runtime layout in tests/runtime-layout) run with the CLI suite.
    include: [
      "src/**/*.test.ts",
      "../tests/generated/**/*.test.ts",
      "../tests/runtime-layout/**/*.test.ts",
    ],
    // Many tests start the CLI or Tilt as a child process. Under the full suite's parallel load those take longer than
    // vitest's 5s default although each passes alone. Tests that need more still set their own budget.
    testTimeout: 30_000,
  },
});
