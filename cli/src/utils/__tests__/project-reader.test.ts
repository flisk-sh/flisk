// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECT_NAME,
  readProjectJson,
  readProjectNameOrUndefined,
  readProjectNameWithFallback,
} from "../project-reader.js";

describe("project-reader", () => {
  function makeTempProject(content?: string): string {
    const root = mkdtempSync(join(tmpdir(), "flisk-project-reader-"));
    const fliskDir = join(root, ".flisk");
    mkdirSync(fliskDir, { recursive: true });
    if (content !== undefined) {
      writeFileSync(join(fliskDir, "project.json"), content, "utf-8");
    }
    return root;
  }

  describe("readProjectJson", () => {
    it("returns parsed object for valid project.json", () => {
      const root = makeTempProject(JSON.stringify({ project: { name: "test-proj" } }));
      expect(readProjectJson(root)).toEqual({ project: { name: "test-proj" } });
    });

    it("returns undefined when file is missing", () => {
      const root = makeTempProject();
      expect(readProjectJson(root)).toBeUndefined();
    });

    it("returns undefined when projectRoot is null", () => {
      expect(readProjectJson(null)).toBeUndefined();
    });

    it("returns undefined when project.json is malformed JSON", () => {
      const root = makeTempProject("{ malformed json");
      expect(readProjectJson(root)).toBeUndefined();
    });

    it("returns undefined when project.json is not an object (e.g. primitive)", () => {
      const root = makeTempProject("null");
      expect(readProjectJson(root)).toBeUndefined();
    });
  });

  describe("readProjectNameOrUndefined", () => {
    it("returns project name when project.name is a non-empty string", () => {
      const root = makeTempProject(JSON.stringify({ project: { name: "my-app" } }));
      expect(readProjectNameOrUndefined(root)).toBe("my-app");
    });

    it("returns undefined when project.json is missing", () => {
      const root = makeTempProject();
      expect(readProjectNameOrUndefined(root)).toBeUndefined();
    });

    it("returns undefined when project.name is missing", () => {
      const root = makeTempProject(JSON.stringify({ project: {} }));
      expect(readProjectNameOrUndefined(root)).toBeUndefined();
    });

    it("returns undefined when project is missing", () => {
      const root = makeTempProject(JSON.stringify({ name: "my-app" }));
      expect(readProjectNameOrUndefined(root)).toBeUndefined();
    });

    it("returns undefined when project.name is empty or whitespace", () => {
      const root = makeTempProject(JSON.stringify({ project: { name: "   " } }));
      expect(readProjectNameOrUndefined(root)).toBeUndefined();
    });

    it("returns undefined when project.name is not a string", () => {
      const root = makeTempProject(JSON.stringify({ project: { name: 12345 } }));
      expect(readProjectNameOrUndefined(root)).toBeUndefined();
    });

    it("returns undefined when project.json is malformed", () => {
      const root = makeTempProject("{ unclosed");
      expect(readProjectNameOrUndefined(root)).toBeUndefined();
    });
  });

  describe("readProjectNameWithFallback", () => {
    it("returns project name when present", () => {
      const root = makeTempProject(JSON.stringify({ project: { name: "custom-proj" } }));
      expect(readProjectNameWithFallback(root)).toBe("custom-proj");
    });

    it("returns default fallback when missing", () => {
      const root = makeTempProject();
      expect(readProjectNameWithFallback(root)).toBe(DEFAULT_PROJECT_NAME);
    });

    it("returns custom fallback when specified", () => {
      const root = makeTempProject();
      expect(readProjectNameWithFallback(root, "my-fallback")).toBe("my-fallback");
    });
  });
});
