// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { toComposeProjectName } from "../compose-project-name.js";

describe("toComposeProjectName", () => {
  it("converts hyphens to underscores", () => {
    expect(toComposeProjectName("my-cool-project")).toBe("my_cool_project");
    expect(toComposeProjectName("flisk-project")).toBe("flisk_project");
    expect(toComposeProjectName("a-b-c-d")).toBe("a_b_c_d");
  });

  it("leaves strings without hyphens unchanged", () => {
    expect(toComposeProjectName("simple_project")).toBe("simple_project");
    expect(toComposeProjectName("shop2")).toBe("shop2");
    expect(toComposeProjectName("lowercase")).toBe("lowercase");
  });

  it("preserves casing", () => {
    expect(toComposeProjectName("My-Shop")).toBe("My_Shop");
    expect(toComposeProjectName("PROJECT-NAME")).toBe("PROJECT_NAME");
  });
});
