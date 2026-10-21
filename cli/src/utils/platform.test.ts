// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  binaryAssetNameFor,
  executableName,
  legacyExecutableName,
  pathLookups,
  tdkArchFor,
  tdkOsFor,
} from "./platform.js";

describe("platform mappings", () => {
  it.each([
    ["linux", "x64", "flisk-linux-amd64"],
    ["darwin", "arm64", "flisk-darwin-arm64"],
    ["win32", "x64", "flisk-windows-amd64.exe"],
    ["win32", "arm64", null],
    ["freebsd", "x64", null],
  ])("maps %s/%s to %s", (platformName, architecture, expected) => {
    expect(binaryAssetNameFor(platformName, architecture)).toBe(expected);
  });

  it("maps Node platform and architecture names", () => {
    expect(tdkOsFor("win32")).toBe("windows");
    expect(tdkArchFor("x64")).toBe("amd64");
    expect(tdkOsFor("windows")).toBeNull();
  });

  it("includes Windows executable suffixes for PATH lookup", () => {
    expect(pathLookups("tilt", true)).toEqual(["tilt", "tilt.exe", "tilt.cmd", "tilt.bat"]);
  });

  it("uses the native executable name for the current operating system", () => {
    expect(executableName()).toBe(process.platform === "win32" ? "flisk.exe" : "flisk");
  });

  it("keeps the pre-rename executable name for legacy installs", () => {
    expect(legacyExecutableName()).toBe(process.platform === "win32" ? "tdk.exe" : "tdk");
  });
});
