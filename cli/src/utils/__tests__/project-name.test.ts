// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { deriveProjectName } from "../project-name.js";

describe("deriveProjectName", () => {
  it.each([
    ["C:\\Users\\me\\work\\shop", "shop"],
    ["C:\\Users\\me\\work\\shop\\", "shop"],
    ["C:/Users/me/work/shop", "shop"],
    ["/home/me/shop", "shop"],
    ["/home/me/shop/", "shop"],
  ])("derives the project name from %s", (projectRoot, expected) => {
    expect(deriveProjectName(projectRoot)).toBe(expected);
  });

  it.each(["C:\\", "C:/", "/", "\\\\server\\share\\"])(
    "falls back for a filesystem root: %s",
    (projectRoot) => {
      expect(deriveProjectName(projectRoot)).toBe("my-project");
    },
  );

  it("slugifies a folder name that is not a valid Docker project name", () => {
    expect(deriveProjectName("C:\\Users\\me\\work\\My Shop")).toBe("my-shop");
  });

  it("keeps valid POSIX folder names unchanged", () => {
    expect(deriveProjectName("/home/me/shop.v2")).toBe("shop.v2");
  });
});
