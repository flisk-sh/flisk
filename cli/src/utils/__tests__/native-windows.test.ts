// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

import {
  NATIVE_WINDOWS_NEXT_STEP,
  NATIVE_WINDOWS_REFUSAL_WITH_NEXT_STEP,
  nativeWindowsImportNotice,
  nativeWindowsStackRefusal,
} from "../native-windows.js";

describe("nativeWindowsStackRefusal", () => {
  it("refuses native Windows with the WSL2 guidance", () => {
    expect(nativeWindowsStackRefusal("win32")).toBe(NATIVE_WINDOWS_REFUSAL_WITH_NEXT_STEP);
    expect(NATIVE_WINDOWS_NEXT_STEP).toContain("You are on Windows. Open Ubuntu (WSL2)");
    expect(NATIVE_WINDOWS_NEXT_STEP).toContain("wsl --install -d Ubuntu");
    expect(NATIVE_WINDOWS_NEXT_STEP).toContain("flisk up");
    expect(NATIVE_WINDOWS_NEXT_STEP).toContain("docs/setup/windows.md");
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

describe("nativeWindowsImportNotice", () => {
  it("tells native Windows before import that flisk up for containers needs WSL2", () => {
    const notice = nativeWindowsImportNotice("win32");
    expect(notice).toContain("import works here");
    expect(notice).toContain("needs Ubuntu on WSL2");
    expect(notice).toContain("command run on Windows as local processes");
    expect(notice).toContain("docs/setup/windows.md");
  });

  it("says nothing off Windows or with the unsupported escape hatch", () => {
    expect(nativeWindowsImportNotice("linux")).toBeNull();
    expect(nativeWindowsImportNotice("darwin")).toBeNull();
    expect(nativeWindowsImportNotice("win32", "1")).toBeNull();
  });
});
