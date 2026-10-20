// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileGenerationTask } from "../../types/index.js";

import {
  ensureDirectory,
  ensureGitignore,
  writeFilesWithProgress,
  writeJsonFile,
  writeJsonFileInDir,
  writeTextFile,
  writeTextFileInDir,
} from "../file-helpers.js";

let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tdk-file-helpers-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("file helpers", () => {
  describe("writeJsonFile & writeJsonFileInDir", () => {
    it("writes JSON with two-space indentation and a trailing newline by default", () => {
      const filePath = join(root, "default.json");

      writeJsonFile(filePath, { name: "api", enabled: true });

      expect(readFileSync(filePath, "utf-8")).toBe('{\n  "name": "api",\n  "enabled": true\n}\n');
    });

    it("respects a custom JSON indentation width", () => {
      const filePath = join(root, "custom.json");

      writeJsonFile(filePath, { name: "api" }, 4);

      expect(readFileSync(filePath, "utf-8")).toBe('{\n    "name": "api"\n}\n');
    });

    it("handles zero indentation", () => {
      const filePath = join(root, "compact.json");

      writeJsonFile(filePath, { name: "api", count: 10 }, 0);

      expect(readFileSync(filePath, "utf-8")).toBe('{"name":"api","count":10}\n');
    });

    it("serializes complex structures including null, arrays, and nested objects", () => {
      const filePath = join(root, "complex.json");
      const data = {
        name: "test",
        active: false,
        nullable: null,
        items: [1, "two", { three: true }],
      };

      writeJsonFile(filePath, data);

      expect(JSON.parse(readFileSync(filePath, "utf-8"))).toEqual(data);
      expect(readFileSync(filePath, "utf-8").endsWith("\n")).toBe(true);
    });

    it("writes JSON files inside the supplied directory", () => {
      writeJsonFileInDir(root, "config.json", { name: "api" });

      expect(readFileSync(join(root, "config.json"), "utf-8")).toBe('{\n  "name": "api"\n}\n');
    });
  });

  describe("writeTextFile & writeTextFileInDir", () => {
    it("writes text content exactly", () => {
      const filePath = join(root, "content.txt");
      const content = "first line\nsecond line\n";

      writeTextFile(filePath, content);

      expect(readFileSync(filePath, "utf-8")).toBe(content);
    });

    it("writes empty string and unicode content properly", () => {
      const emptyFile = join(root, "empty.txt");
      const unicodeFile = join(root, "unicode.txt");
      const unicodeContent = "alpha beta gamma αβγ 你好";

      writeTextFile(emptyFile, "");
      writeTextFile(unicodeFile, unicodeContent);

      expect(readFileSync(emptyFile, "utf-8")).toBe("");
      expect(readFileSync(unicodeFile, "utf-8")).toBe(unicodeContent);
    });

    it("writes text files inside the supplied directory", () => {
      writeTextFileInDir(root, "notes.txt", "created in the requested directory");

      expect(readFileSync(join(root, "notes.txt"), "utf-8")).toBe(
        "created in the requested directory",
      );
    });
  });

  describe("ensureDirectory", () => {
    it("creates nested directories and accepts an existing directory", () => {
      const nested = join(root, "one", "two", "three");

      ensureDirectory(nested);

      expect(existsSync(nested)).toBe(true);
      expect(() => ensureDirectory(nested)).not.toThrow();
    });

    it("does nothing when directory already exists", () => {
      ensureDirectory(root);
      expect(existsSync(root)).toBe(true);
    });
  });

  describe("writeFilesWithProgress", () => {
    it("writes both json and text files and reports progress callback", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const progressCalls: Array<{ task: FileGenerationTask; index: number; total: number }> = [];

      const tasks: FileGenerationTask[] = [
        {
          type: "json",
          filename: "service.json",
          content: { name: "order-service" },
          description: "Generating service manifest",
          emoji: "[1/2]",
        },
        {
          type: "text",
          filename: "Dockerfile",
          content: "FROM node:22-alpine\nCMD npm start\n",
          description: "Generating Dockerfile",
          emoji: "[2/2]",
        },
      ];

      writeFilesWithProgress(root, tasks, (task, index, total) => {
        progressCalls.push({ task, index, total });
      });

      expect(existsSync(join(root, "service.json"))).toBe(true);
      expect(JSON.parse(readFileSync(join(root, "service.json"), "utf-8"))).toEqual({
        name: "order-service",
      });

      expect(existsSync(join(root, "Dockerfile"))).toBe(true);
      expect(readFileSync(join(root, "Dockerfile"), "utf-8")).toBe(
        "FROM node:22-alpine\nCMD npm start\n",
      );

      expect(progressCalls).toHaveLength(2);
      expect(progressCalls[0]).toEqual({
        task: tasks[0],
        index: 0,
        total: 2,
      });
      expect(progressCalls[1]).toEqual({
        task: tasks[1],
        index: 1,
        total: 2,
      });

      expect(consoleSpy).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });

    it("works without an onProgress callback", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const tasks: FileGenerationTask[] = [
        {
          type: "text",
          filename: "config.env",
          content: "KEY=value\n",
          description: "Generating env config",
          emoji: "[task]",
        },
      ];

      expect(() => writeFilesWithProgress(root, tasks)).not.toThrow();
      expect(readFileSync(join(root, "config.env"), "utf-8")).toBe("KEY=value\n");

      consoleSpy.mockRestore();
    });
  });

  describe("ensureGitignore", () => {
    it("creates .gitignore with all missing entries if file does not exist", () => {
      const added = ensureGitignore(root);

      expect(added).toEqual([
        ".env",
        ".tdk/.tdk-out/",
        ".tdk/.project-id",
        ".tdk/smoke/",
        "node_modules/",
      ]);

      const content = readFileSync(join(root, ".gitignore"), "utf-8");
      expect(content).toContain("# TDK (generated files and secrets)\n");
      expect(content).toContain(".env\n");
      expect(content).toContain(".tdk/.tdk-out/\n");
      expect(content).toContain(".tdk/.project-id\n");
      expect(content).toContain(".tdk/smoke/\n");
      expect(content).toContain("node_modules/\n");
    });

    it("appends only missing entries to existing .gitignore lacking newline", () => {
      writeFileSync(join(root, ".gitignore"), "dist\n.env");
      const added = ensureGitignore(root);

      expect(added).toEqual([".tdk/.tdk-out/", ".tdk/.project-id", ".tdk/smoke/", "node_modules/"]);

      const content = readFileSync(join(root, ".gitignore"), "utf-8");
      expect(content.startsWith("dist\n.env\n\n# TDK (generated files and secrets)\n")).toBe(true);
    });

    it("returns empty array and does not modify file if all entries exist", () => {
      ensureGitignore(root);
      const original = readFileSync(join(root, ".gitignore"), "utf-8");

      const secondRun = ensureGitignore(root);
      expect(secondRun).toEqual([]);
      expect(readFileSync(join(root, ".gitignore"), "utf-8")).toBe(original);
    });

    it("recognizes entries regardless of trailing slash presence", () => {
      writeFileSync(
        join(root, ".gitignore"),
        ".env\n.tdk/.tdk-out\n.tdk/.project-id\n.tdk/smoke\nnode_modules\n",
      );

      const added = ensureGitignore(root);
      expect(added).toEqual([]);
    });
  });
});
