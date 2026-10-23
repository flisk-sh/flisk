// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

import { NATIVE_WINDOWS_REFUSAL, nativeWindowsStackRefusal } from "../native-windows.js";

describe("nativeWindowsStackRefusal", () => {
  it("refuses native Windows with the WSL2 guidance", () => {
    expect(nativeWindowsStackRefusal("win32")).toBe(NATIVE_WINDOWS_REFUSAL);
    expect(NATIVE_WINDOWS_REFUSAL).toContain("WSL2");
    expect(NATIVE_WINDOWS_REFUSAL).toContain("Ubuntu");
  });

  it("lets the unsupported escape hatch through", () => {
    expect(nativeWindowsStackRefusal("win32", "1")).toBeNull();
    expect(nativeWindowsStackRefusal("win32", "0")).not.toBeNull();
    expect(nativeWindowsStackRefusal("win32", "yes")).not.toBeNull();
  });

  it("leaves macOS and Linux alone", () => {
    expect(nativeWindowsStackRefusal("darwin")).toBeNull();
    expect(nativeWindowsStackRefusal("linux")).toBeNull();
  });
});
