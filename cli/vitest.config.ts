// Copyright (c) 2026 Flisk contributors
// SPDX-License-Identifier: MIT
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Many tests start the CLI or Tilt as a child process. Under the full suite's parallel load those take longer than
    // vitest's 5s default although each passes alone. Tests that need more still set their own budget.
    testTimeout: 30_000,
  },
});
