// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROJECT_JSON } from "./constants.js";
import { evaluateFliskVersionFloor, evaluateFliskVersionPin } from "./flisk-version.js";

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), "flisk-version-floor-"));
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

function writeProjectJson(content: unknown): void {
  mkdirSync(join(projectRoot, ".flisk"), { recursive: true });
  writeFileSync(join(projectRoot, ".flisk", PROJECT_JSON), JSON.stringify(content));
}

describe("evaluateFliskVersionFloor", () => {
  describe("none", () => {
    it("returns none when the project has no .flisk/project.json", () => {
      expect(evaluateFliskVersionFloor(projectRoot, "1.3.80")).toEqual({ status: "none" });
    });

    it("returns none when project.json does not set minFliskVersion", () => {
      writeProjectJson({ name: "demo" });

      expect(evaluateFliskVersionFloor(projectRoot, "1.3.80")).toEqual({ status: "none" });
    });
  });

  describe("ok", () => {
    it("is ok when the current version equals the minimum", () => {
      writeProjectJson({ minFliskVersion: "1.3.80" });

      expect(evaluateFliskVersionFloor(projectRoot, "1.3.80")).toEqual({
        status: "ok",
        required: "1.3.80",
      });
    });

    it.each(["1.3.81", "1.3.100", "1.4.0", "2.0.0"])(
      "is ok when the current version is newer: %s",
      (current) => {
        writeProjectJson({ minFliskVersion: "1.3.80" });

        expect(evaluateFliskVersionFloor(projectRoot, current)).toEqual({
          status: "ok",
          required: "1.3.80",
        });
      },
    );

    it("ignores whitespace around the pinned version", () => {
      writeProjectJson({ minFliskVersion: " 1.3.80 " });

      expect(evaluateFliskVersionFloor(projectRoot, "1.3.80")).toEqual({
        status: "ok",
        required: "1.3.80",
      });
    });
  });

  describe("too-old", () => {
    it("reports the required version, a message and an upgrade hint", () => {
      writeProjectJson({ minFliskVersion: "1.3.80" });

      expect(evaluateFliskVersionFloor(projectRoot, "1.3.79")).toMatchObject({
        status: "too-old",
        required: "1.3.80",
        message: expect.stringMatching(/1\.3\.79.*1\.3\.80/),
        fix: expect.stringContaining("flisk upgrade"),
      });
    });

    it.each(["1.3.79", "1.2.99", "0.9.999"])(
      "is too old when the current version is lower: %s",
      (current) => {
        writeProjectJson({ minFliskVersion: "1.3.80" });

        expect(evaluateFliskVersionFloor(projectRoot, current)).toMatchObject({
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
        writeProjectJson({ minFliskVersion: value });

        expect(evaluateFliskVersionFloor(projectRoot, "1.3.80")).toMatchObject({
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
      writeProjectJson({ minFliskVersion: value });

      expect(evaluateFliskVersionFloor(projectRoot, "1.3.80")).toMatchObject({
        status: "malformed",
        message: expect.stringContaining(JSON.stringify(value)),
      });
    });
  });
});

describe("minTdkVersion compatibility", () => {
  it("uses the legacy field when minFliskVersion is absent", () => {
    writeProjectJson({ minTdkVersion: "1.3.80" });

    expect(evaluateFliskVersionFloor(projectRoot, "1.3.80")).toMatchObject({
      status: "ok",
      required: "1.3.80",
      deprecationWarning: expect.stringContaining("minTdkVersion"),
    });
  });

  it("prioritizes minFliskVersion when both fields exist", () => {
    writeProjectJson({
      minFliskVersion: "1.3.80",
      minTdkVersion: "1.3.90",
    });

    expect(evaluateFliskVersionFloor(projectRoot, "1.3.80")).toMatchObject({
      status: "ok",
      required: "1.3.80",
      deprecationWarning: expect.stringContaining("ignored"),
    });
  });

  it("rejects a malformed legacy minimum version", () => {
    writeProjectJson({ minTdkVersion: "latest" });

    expect(evaluateFliskVersionFloor(projectRoot, "1.3.80")).toMatchObject({
      status: "malformed",
      message: expect.stringContaining("latest"),
    });
  });
});

describe("evaluateFliskVersionPin", () => {
  describe("none", () => {
    it("returns none when the project has no pin", () => {
      writeProjectJson({ name: "demo" });

      expect(evaluateFliskVersionPin(projectRoot, "1.3.80")).toEqual({
        status: "none",
      });
    });

    it("returns none when project.json does not exist", () => {
      expect(evaluateFliskVersionPin(projectRoot, "1.3.80")).toEqual({
        status: "none",
      });
    });
  });

  describe("ok", () => {
    it("passes when the current version exactly matches the pin", () => {
      writeProjectJson({ pinnedFliskVersion: "1.3.80" });

      expect(evaluateFliskVersionPin(projectRoot, "1.3.80")).toEqual({
        status: "ok",
        required: "1.3.80",
      });
    });

    it("passes when the pin satisfies the minimum version", () => {
      writeProjectJson({
        minFliskVersion: "1.3.80",
        pinnedFliskVersion: "1.3.90",
      });

      expect(evaluateFliskVersionPin(projectRoot, "1.3.90")).toMatchObject({
        status: "ok",
        required: "1.3.90",
      });
    });
  });

  describe("mismatch", () => {
    it.each(["1.3.79", "1.3.81", "1.4.0", "2.0.0"])(
      "rejects a current version different from the pin: %s",
      (current) => {
        writeProjectJson({ pinnedFliskVersion: "1.3.80" });

        expect(evaluateFliskVersionPin(projectRoot, current)).toMatchObject({
          status: "mismatch",
          required: "1.3.80",
          current,
          message: expect.stringContaining("1.3.80"),
          fix: expect.stringContaining("npm install -g @flisk-sh/flisk@1.3.80"),
        });
      },
    );

    it("explains how to deliberately move the pin", () => {
      writeProjectJson({ pinnedFliskVersion: "1.3.80" });

      expect(evaluateFliskVersionPin(projectRoot, "1.3.81")).toMatchObject({
        status: "mismatch",
        fix: expect.stringContaining("edit pinnedFliskVersion"),
      });
    });
  });

  describe("malformed", () => {
    it.each(["abc", "1.3", "v1.3.80", "1.3.80-beta", "1.3.80.1", ""])(
      "rejects invalid pin %j",
      (value) => {
        writeProjectJson({ pinnedFliskVersion: value });

        expect(evaluateFliskVersionPin(projectRoot, "1.3.80")).toMatchObject({
          status: "malformed",
        });
      },
    );

    it.each([1.3, null, true, ["1.3.80"], { version: "1.3.80" }])(
      "rejects a non-string pin: %j",
      (value) => {
        writeProjectJson({ pinnedFliskVersion: value });

        expect(evaluateFliskVersionPin(projectRoot, "1.3.80")).toMatchObject({
          status: "malformed",
        });
      },
    );

    it("rejects a pin lower than minFliskVersion", () => {
      writeProjectJson({
        minFliskVersion: "1.3.80",
        pinnedFliskVersion: "1.3.79",
      });

      expect(evaluateFliskVersionPin(projectRoot, "1.3.79")).toMatchObject({
        status: "malformed",
        message: expect.stringContaining("lower than minFliskVersion"),
      });
    });

    it("also respects the legacy minimum version", () => {
      writeProjectJson({
        minTdkVersion: "1.3.80",
        pinnedFliskVersion: "1.3.79",
      });

      expect(evaluateFliskVersionPin(projectRoot, "1.3.79")).toMatchObject({
        status: "malformed",
        message: expect.stringContaining("minTdkVersion"),
      });
    });
  });
});

describe("evaluateFliskVersionFloor with a prerelease CLI", () => {
  it("treats 1.4.28-rc.1 as meeting 1.4.0", () => {
    const root = mkdtempSync(join(tmpdir(), "flisk-floor-"));
    mkdirSync(join(root, ".flisk"));
    writeFileSync(
      join(root, ".flisk", "project.json"),
      JSON.stringify({ minFliskVersion: "1.4.0" }),
    );
    expect(evaluateFliskVersionFloor(root, "1.4.28-rc.1").status).toBe("ok");
  });
});
