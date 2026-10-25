// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  describeLayoutProblems,
  hasExtensionLayout,
  inspectExtensionLayout,
  resolveExtensionDir,
  resolveSharedPlatformDir,
  resolveTiltfile,
} from "../runtime-layout.js";

const ENTRIES = ["engine", "discovery", "specs", "ext"] as const;
const writeFlat = (root: string) => {
  writeFileSync(join(root, "Tiltfile"), "");
  for (const dir of ENTRIES) mkdirSync(join(root, dir), { recursive: true });
};
const writeNested = (root: string) => {
  mkdirSync(join(root, "runtime"), { recursive: true });
  writeFileSync(join(root, "runtime", "Tiltfile"), "");
  for (const dir of ENTRIES) mkdirSync(join(root, "runtime", dir), { recursive: true });
};

describe("runtime-layout", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "flisk-layout-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("uses the flat layout when there is no runtime folder", () => {
    writeFlat(root);
    expect(resolveExtensionDir(root, "engine")).toBe(join(root, "engine"));
    expect(hasExtensionLayout(root)).toBe(true);
  });

  it("prefers the nested runtime layout when present", () => {
    writeNested(root);
    writeFlat(root);
    expect(resolveExtensionDir(root, "engine")).toBe(join(root, "runtime", "engine"));
    expect(hasExtensionLayout(root)).toBe(true);
  });

  it("resolves the shared platform helpers under runtime/ and falls back to the bundle root", () => {
    expect(resolveSharedPlatformDir(root)).toBe(join(root, "shared-platform-engineering"));
    mkdirSync(join(root, "runtime", "shared-platform-engineering"), { recursive: true });
    expect(resolveSharedPlatformDir(root)).toBe(
      join(root, "runtime", "shared-platform-engineering"),
    );
  });

  it("reports no layout without a Tiltfile or engine", () => {
    expect(hasExtensionLayout(root)).toBe(false);
    mkdirSync(join(root, "engine"));
    expect(hasExtensionLayout(root)).toBe(false);
  });

  it("resolves the nested runtime Tiltfile when present", () => {
    mkdirSync(join(root, "runtime"));
    writeFileSync(join(root, "runtime", "Tiltfile"), "");
    writeFileSync(join(root, "Tiltfile"), "");
    expect(resolveTiltfile(root)).toBe(join(root, "runtime", "Tiltfile"));
  });

  it("falls back to the flat Tiltfile for packaged and vendored layouts", () => {
    writeFileSync(join(root, "Tiltfile"), "");
    expect(resolveTiltfile(root)).toBe(join(root, "Tiltfile"));
  });

  it("returns the flat path when no Tiltfile exists, so callers report it missing", () => {
    expect(resolveTiltfile(root)).toBe(join(root, "Tiltfile"));
  });

  describe("mixed and incomplete layouts", () => {
    it("accepts a complete nested layout and a complete flat layout", () => {
      writeNested(root);
      expect(inspectExtensionLayout(root)).toMatchObject({ ok: true, kind: "nested" });
      const flatRoot = mkdtempSync(join(tmpdir(), "flisk-layout-flat-"));
      try {
        writeFlat(flatRoot);
        expect(inspectExtensionLayout(flatRoot)).toMatchObject({ ok: true, kind: "flat" });
      } finally {
        rmSync(flatRoot, { recursive: true, force: true });
      }
    });

    it("rejects a runtime Tiltfile with a flat engine as mixed", () => {
      mkdirSync(join(root, "runtime"));
      writeFileSync(join(root, "runtime", "Tiltfile"), "");
      mkdirSync(join(root, "engine"));
      const report = inspectExtensionLayout(root);
      expect(report.ok).toBe(false);
      expect(report.kind).toBe("mixed");
      expect(report.mixed).toEqual(["engine"]);
      expect(hasExtensionLayout(root)).toBe(false);
    });

    it("rejects a stale flat tree next to a nested one that lacks a directory", () => {
      writeNested(root);
      rmSync(join(root, "runtime", "discovery"), { recursive: true });
      mkdirSync(join(root, "discovery"));
      const report = inspectExtensionLayout(root);
      expect(report).toMatchObject({ ok: false, kind: "mixed", mixed: ["discovery"] });
      expect(describeLayoutProblems(root, report)).toContain("discovery only at the root");
    });

    it("names every missing entry of an incomplete nested layout", () => {
      writeNested(root);
      rmSync(join(root, "runtime", "specs"), { recursive: true });
      rmSync(join(root, "runtime", "ext"), { recursive: true });
      const report = inspectExtensionLayout(root);
      expect(report).toMatchObject({ ok: false, kind: "incomplete", missing: ["specs", "ext"] });
      expect(describeLayoutProblems(root, report)).toContain("is missing specs, ext");
    });

    it("rejects a flat layout that lacks a directory the vendor step would copy", () => {
      writeFlat(root);
      rmSync(join(root, "discovery"), { recursive: true });
      const report = inspectExtensionLayout(root);
      expect(report).toMatchObject({ ok: false, kind: "incomplete", missing: ["discovery"] });
    });

    it("reports an empty folder as missing every entry", () => {
      expect(inspectExtensionLayout(root)).toMatchObject({
        ok: false,
        kind: "incomplete",
        missing: ["Tiltfile", ...ENTRIES],
      });
    });
  });
});
