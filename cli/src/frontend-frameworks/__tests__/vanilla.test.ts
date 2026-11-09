// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { vanillaFrontendProvider } from "../vanilla.js";

describe("vanilla frontend provider", () => {
  it("identifies itself as the Vanilla TypeScript and Vite provider", () => {
    expect(vanillaFrontendProvider.id).toBe("vanilla");
    expect(vanillaFrontendProvider.label).toBe("Vanilla TypeScript + Vite");
  });

  it("declares no framework-specific dependencies", () => {
    expect(vanillaFrontendProvider.dependencies).toEqual({});
    expect(vanillaFrontendProvider.devDependencies).toEqual({});
  });

  it("creates the expected non-empty files in order", () => {
    const files = vanillaFrontendProvider.createFiles("my-app");

    expect(files.map((file) => file.filename)).toEqual(["index.html", "src/main.ts", "src/app.ts"]);
    expect(files.every((file) => file.content.trim().length > 0)).toBe(true);
  });

  it("uses the project name in the HTML title", () => {
    const indexFile = vanillaFrontendProvider
      .createFiles("my-app")
      .find((file) => file.filename === "index.html");

    expect(indexFile?.content).toContain("<title>my-app</title>");
  });
});
