// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { nextFrontendProvider } from "../next.js";
import { getFrontendFramework } from "../registry.js";

describe("next frontend provider", () => {
  it("is registered under the id 'next'", () => {
    expect(getFrontendFramework("next")?.id).toBe("next");
  });

  it("has the App Router label", () => {
    expect(nextFrontendProvider.label).toBe("Next.js (App Router)");
  });

  it("declares React 19 dependencies", () => {
    expect(nextFrontendProvider.dependencies).toMatchObject({
      react: "^19.0.0",
      "react-dom": "^19.0.0",
    });
  });

  it("exposes dev, build, and start scripts", () => {
    expect(nextFrontendProvider.scripts).toMatchObject({
      dev: "next dev",
      build: "next build",
      start: "next start",
    });
  });

  it("enables the Next.js TypeScript plugin", () => {
    expect(nextFrontendProvider.tsconfig?.compilerOptions?.plugins).toEqual([{ name: "next" }]);
  });

  it("generates the App Router files", () => {
    const files = nextFrontendProvider.createFiles("demo", {});
    const names = files.map((f) => f.filename);
    expect(names).toEqual(
      expect.arrayContaining([
        "next.config.mjs",
        "src/app/layout.tsx",
        "src/app/page.tsx",
        "src/app/health/route.ts",
      ]),
    );
  });

  it("uses the project name in the layout metadata", () => {
    const layout = nextFrontendProvider
      .createFiles("demo", {})
      .find((f) => f.filename === "src/app/layout.tsx");
    expect(layout?.content).toContain("demo");
  });

  it("adds health-card.tsx only when a backend is set", () => {
    const without = nextFrontendProvider.createFiles("demo", {}).map((f) => f.filename);
    const withBackend = nextFrontendProvider
      .createFiles("demo", { backendName: "api" })
      .map((f) => f.filename);
    expect(without).not.toContain("src/app/health-card.tsx");
    expect(withBackend).toContain("src/app/health-card.tsx");
  });
});
