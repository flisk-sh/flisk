// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The vitest config of the weekly Stryker run (.github/workflows/scoreboard.yml). Stryker reruns the tests once per mutant,
// so it gets only the pure unit tests of the two generator files it mutates: no Tilt, Docker, network or child processes,
// which the full suite's config (vitest.config.ts) also includes and which would fail or crawl 761 times.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/generator/__tests__/template-engine.test.ts",
      "src/generator/__tests__/resource-templates.test.ts",
      "src/generator/__tests__/generated-headers.test.ts",
      // Renders whole projects through generateMasterConfigs and compares them with checked-in golden files: the
      // only pure test of most of template-engine.ts, so without it those mutants count as NoCoverage.
      "src/generator/__tests__/golden-generated-output.test.ts",
    ],
    testTimeout: 30_000,
  },
});
