// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FIXTURE = join(__dirname, "../../../../tests/fixtures/unopinionated");

const FRAMEWORK_FILES = ["vite.config.ts", "tsconfig.json", "nginx.conf", "index.html"];

describe("unopinionated fixture", () => {
  it("declares a service.json with the minimal contract", () => {
    const service = JSON.parse(readFileSync(join(FIXTURE, "service.json"), "utf8"));
    expect(service.name).toBe("unopinionated-api");
    expect(service.port).toBe(4000);
    expect(service.dev.command).toBe("node server.js");
  });

  it("ships no generated framework files", () => {
    const files = readdirSync(FIXTURE);
    for (const file of FRAMEWORK_FILES) {
      expect(existsSync(join(FIXTURE, file))).toBe(false);
    }
    expect(files).toEqual(expect.arrayContaining(["service.json", "server.js"]));
  });

  it.todo("flisk up generates no framework files for this fixture (tracked in #2226)");
});
