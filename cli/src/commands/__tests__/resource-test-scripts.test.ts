// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempProject, runFlisk } from "../../test-support/index.js";
import { createPackageJson } from "../resource.js";

describe("resource scaffold tests", () => {
  it.each(["backend", "mcp", "agent", "worker", "frontend"])(
    "createPackageJson_runsTestsOnce_%s",
    (type) => {
      const scripts = createPackageJson("sample", type).scripts;
      expect(scripts.test).toBe("vitest run");
      expect(scripts["test:watch"]).toBe("vitest --watch");
    },
  );

  it.each([{ frameworkArgs: [] }, { frameworkArgs: ["--framework", "hono"] }])(
    "resource_generatesBackendHealthTest_%j",
    ({ frameworkArgs }) => {
      const root = createTempProject();
      const result = runFlisk(
        ["resource", "api", "--type", "backend", "--stack", "main", "--yes", ...frameworkArgs],
        { cwd: root, input: "" },
      );
      expect(result.status, result.stderr).toBe(0);
      const test = readFileSync(
        join(root, "services", "main", "api", "tests", "api.test.ts"),
        "utf-8",
      );
      expect(test).toContain("/health");
      expect(test).toContain("toBe(200)");
      expect(test).toContain("service: 'api'");
      expect(test).not.toContain("it.todo");
    },
  );
});
