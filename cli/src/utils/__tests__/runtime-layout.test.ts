// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasExtensionLayout, resolveExtensionDir } from "../runtime-layout.js";

describe("runtime-layout", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "flisk-layout-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("uses the flat layout when there is no runtime folder", () => {
    mkdirSync(join(root, "engine"));
    writeFileSync(join(root, "Tiltfile"), "");
    expect(resolveExtensionDir(root, "engine")).toBe(join(root, "engine"));
    expect(hasExtensionLayout(root)).toBe(true);
  });

  it("prefers the nested runtime layout when present", () => {
    mkdirSync(join(root, "runtime", "engine"), { recursive: true });
    mkdirSync(join(root, "engine"));
    writeFileSync(join(root, "Tiltfile"), "");
    expect(resolveExtensionDir(root, "engine")).toBe(join(root, "runtime", "engine"));
    expect(hasExtensionLayout(root)).toBe(true);
  });

  it("reports no layout without a Tiltfile or engine", () => {
    expect(hasExtensionLayout(root)).toBe(false);
    mkdirSync(join(root, "engine"));
    expect(hasExtensionLayout(root)).toBe(false);
  });
});
