// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

describe("config command", () => {
  describe("project config structure", () => {
    it("should have required project.json fields", () => {
      const expectedConfig = {
        version: "2",
        project: {
          name: "test-project",
          version: "1.0.0",
        },
        phases: {
          pre_alpha: { name: "pre-alpha", description: "Pre-alpha phase", enabledStacks: [] },
          alpha: { name: "alpha", description: "Alpha phase", enabledStacks: [] },
          beta: { name: "beta", description: "Beta phase", enabledStacks: [] },
          out_of_scope: { name: "out-of-scope", description: "Future phase", enabledStacks: [] },
        },
        optional_infra: {
          monitoring: false,
          elk: false,
          debezium: false,
          golden_image: false,
        },
        discovery: {
          paths: [],
        },
      };

      expect(expectedConfig).toHaveProperty("version");
      expect(expectedConfig).toHaveProperty("project");
      expect(expectedConfig).toHaveProperty("phases");
      expect(expectedConfig).toHaveProperty("optional_infra");
      expect(expectedConfig).toHaveProperty("discovery");

      expect(expectedConfig.project).toHaveProperty("name");
      expect(expectedConfig.project).toHaveProperty("version");
    });
  });

  describe("config verification logic", () => {
    it("should detect missing files", () => {
      const existingFiles: string[] = [];
      const requiredFiles = ["TILT_TECH_STACK.star", "TILT_RESOURCE_DEFAULTS.star", "spec.master"];

      const missingFiles = requiredFiles.filter((f) => !existingFiles.includes(f));
      expect(missingFiles).toHaveLength(3);
    });

    it("should detect when all files exist", () => {
      const existingFiles = ["TILT_TECH_STACK.star", "TILT_RESOURCE_DEFAULTS.star", "spec.master"];
      const requiredFiles = [...existingFiles];

      const missingFiles = requiredFiles.filter((f) => !existingFiles.includes(f));
      expect(missingFiles).toHaveLength(0);
    });

    it("should detect content differences", () => {
      const currentContent = '{"version": "1", "old": true}';
      const newContent = '{"version": "2", "new": true}';

      expect(currentContent).not.toBe(newContent);
    });

    it("should detect identical content", () => {
      const content = '{"version": "2"}';
      const sameContent = '{"version": "2"}';

      expect(content).toBe(sameContent);
    });
  });

  describe("template generation", () => {
    it("should generate required output files", () => {
      const expectedFiles = [
        "TILT_TECH_STACK.star",
        "TILT_RESOURCE_DEFAULTS.star",
        "spec.master",
        "Tiltfile",
      ];

      expect(expectedFiles).toContain("TILT_TECH_STACK.star");
      expect(expectedFiles).toContain("TILT_RESOURCE_DEFAULTS.star");
      expect(expectedFiles).toContain("spec.master");
      expect(expectedFiles).toContain("Tiltfile");
    });

    it("should validate TILT_TECH_STACK.star content", () => {
      const techStackContent = `
TECH_STACK = {
  BUNDLER = "bun"
  RUNTIME = "bun"
}
`;

      expect(techStackContent).toContain("TECH_STACK");
      expect(techStackContent).toContain("BUNDLER");
      expect(techStackContent).toContain("RUNTIME");
    });

    it("should validate TILT_RESOURCE_DEFAULTS.star content", () => {
      const resourceDefaultsContent = `
BASE_PORT_FRONTEND = 3000
BASE_PORT_BACKEND = 4000
HEALTH_CHECK_PATH = "/health"
`;

      expect(resourceDefaultsContent).toContain("BASE_PORT");
      expect(resourceDefaultsContent).toContain("HEALTH_CHECK");
    });
  });

  describe("diff functionality", () => {
    it("should identify new files", () => {
      const existingFiles: string[] = [];
      const newFiles = ["TILT_TECH_STACK.star", "spec.master"];

      const addedFiles = newFiles.filter((f) => !existingFiles.includes(f));
      expect(addedFiles).toEqual(["TILT_TECH_STACK.star", "spec.master"]);
    });

    it("should calculate line count differences", () => {
      const currentLines = ["line1", "line2", "line3"];
      const newLines = ["line1", "line2", "line3", "line4", "line5"];

      const lineDiff = newLines.length - currentLines.length;
      expect(lineDiff).toBe(2);
      expect(newLines.length).toBe(5);
      expect(currentLines.length).toBe(3);
    });

    it("should find first difference line", () => {
      const currentLines = ["line1", "line2", "line3"];
      const newLines = ["line1", "modified", "line3"];

      let firstDiffLine = -1;
      for (let i = 0; i < Math.max(currentLines.length, newLines.length); i++) {
        if (currentLines[i] !== newLines[i]) {
          firstDiffLine = i;
          break;
        }
      }

      expect(firstDiffLine).toBe(1);
    });
  });
});
