// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isNativeProject } from "../native-service.js";
import { validateServiceManifest } from "../service-manifest.js";
import { discoverResourcesWithProblems } from "../services.js";

const FIXTURE = join(__dirname, "../../../../tests/fixtures/unopinionated");

const FRAMEWORK_FILES = [
  "vite.config.ts",
  "tsconfig.json",
  "nginx.conf",
  "index.html",
  "Dockerfile",
  "package.json",
];

const readService = (dir: string) =>
  JSON.parse(readFileSync(join(FIXTURE, dir, "service.json"), "utf8"));

// `flisk up` on this fixture (with Docker and Tilt absent) is covered by commands/__tests__/up-native-e2e.test.ts.
describe("unopinionated fixture", () => {
  it("declares two services with the minimal contract: appName, appType, a command, a port", () => {
    expect(readService("api")).toMatchObject({
      appName: "unopinionated-api",
      appType: "backend",
      command: "node server.js",
      port: 4000,
    });
    expect(readService("web")).toMatchObject({
      appName: "unopinionated-web",
      appType: "frontend",
      command: "node server.js",
      port: 3000,
      dependsOn: ["unopinionated-api"],
    });
  });

  it("is valid without a stack, image or Dockerfile", () => {
    for (const dir of ["api", "web"]) {
      const service = readService(dir);
      for (const field of ["stack", "image", "dockerfile", "name", "type"]) {
        expect(service).not.toHaveProperty(field);
      }
      expect(validateServiceManifest(service, `${dir}/service.json`)).toMatchObject({
        errors: [],
        warnings: [],
      });
    }
    const { resources, problems } = discoverResourcesWithProblems(FIXTURE);
    expect(problems).toEqual([]);
    expect(isNativeProject(resources)).toBe(true);
  });

  it("ships no generated framework files", () => {
    for (const dir of ["api", "web"]) {
      for (const file of FRAMEWORK_FILES) {
        expect(existsSync(join(FIXTURE, dir, file)), `${dir}/${file}`).toBe(false);
      }
      expect(readdirSync(join(FIXTURE, dir)).sort()).toEqual(["server.js", "service.json"]);
    }
  });
});
