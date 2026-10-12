// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROJECT_JSON } from "./constants.js";
import { evaluateTdkVersionFloor } from "./tdk-version.js";

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), "tdk-version-floor-"));
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

function writeProjectJson(content: unknown): void {
  mkdirSync(join(projectRoot, ".tdk"), { recursive: true });
  writeFileSync(join(projectRoot, ".tdk", PROJECT_JSON), JSON.stringify(content));
}

describe("evaluateTdkVersionFloor", () => {
  describe("none", () => {
    it("returns none when the project has no .tdk/project.json", () => {
      expect(evaluateTdkVersionFloor(projectRoot, "1.3.80")).toEqual({ status: "none" });
    });

    it("returns none when project.json does not set minTdkVersion", () => {
      writeProjectJson({ name: "demo" });

      expect(evaluateTdkVersionFloor(projectRoot, "1.3.80")).toEqual({ status: "none" });
    });
  });

  describe("ok", () => {
    it("is ok when the current version equals the minimum", () => {
      writeProjectJson({ minTdkVersion: "1.3.80" });

      expect(evaluateTdkVersionFloor(projectRoot, "1.3.80")).toEqual({
        status: "ok",
        required: "1.3.80",
      });
    });

    it.each(["1.3.81", "1.3.100", "1.4.0", "2.0.0"])(
      "is ok when the current version is newer: %s",
      (current) => {
        writeProjectJson({ minTdkVersion: "1.3.80" });

        expect(evaluateTdkVersionFloor(projectRoot, current)).toEqual({
          status: "ok",
          required: "1.3.80",
        });
      },
    );

    it("ignores whitespace around the pinned version", () => {
      writeProjectJson({ minTdkVersion: " 1.3.80 " });

      expect(evaluateTdkVersionFloor(projectRoot, "1.3.80")).toEqual({
        status: "ok",
        required: "1.3.80",
      });
    });
  });

  describe("too-old", () => {
    it("reports the required version, a message and an upgrade hint", () => {
      writeProjectJson({ minTdkVersion: "1.3.80" });

      expect(evaluateTdkVersionFloor(projectRoot, "1.3.79")).toMatchObject({
        status: "too-old",
        required: "1.3.80",
        message: expect.stringMatching(/1\.3\.79.*1\.3\.80/),
        fix: expect.stringContaining("tdk upgrade"),
      });
    });

    it.each(["1.3.79", "1.2.99", "0.9.999"])(
      "is too old when the current version is lower: %s",
      (current) => {
        writeProjectJson({ minTdkVersion: "1.3.80" });

        expect(evaluateTdkVersionFloor(projectRoot, current)).toMatchObject({
          status: "too-old",
          required: "1.3.80",
        });
      },
    );
  });

  describe("malformed", () => {
    it.each(["1.3", "v1.3.80", "1.3.80-beta", "1.3.80.1", "latest", ""])(
      "rejects the string %j",
      (value) => {
        writeProjectJson({ minTdkVersion: value });

        expect(evaluateTdkVersionFloor(projectRoot, "1.3.80")).toMatchObject({
          status: "malformed",
          message: expect.stringContaining(JSON.stringify(value)),
          fix: expect.stringContaining("MAJOR.MINOR.PATCH"),
        });
      },
    );

    it.each<[string, unknown]>([
      ["a number", 1.3],
      ["null", null],
      ["a boolean", true],
      ["an array", ["1.3.80"]],
      ["an object", { major: 1 }],
    ])("rejects %s", (_label, value) => {
      writeProjectJson({ minTdkVersion: value });

      expect(evaluateTdkVersionFloor(projectRoot, "1.3.80")).toMatchObject({
        status: "malformed",
        message: expect.stringContaining(JSON.stringify(value)),
      });
    });
  });
});
