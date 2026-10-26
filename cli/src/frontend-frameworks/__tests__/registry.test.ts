// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createServiceJson } from "../../commands/resource.js";
import { FliskError } from "../../utils/errors.js";
import {
  FRONTEND_FRAMEWORKS,
  getFrontendFramework,
  listFrontendFrameworks,
  resolveFrontendFramework,
  VERIFIED_FRONTEND_FRAMEWORKS,
} from "../registry.js";

const SPA_IDS = [
  "react",
  "vue",
  "svelte",
  "preact",
  "lit",
  "solid",
  "qwik",
  "tanstack-router",
  "vanilla",
];

describe("frontend framework inventory", () => {
  it("lists the registered vite-spa adapters and the Next.js server provider", () => {
    const list = listFrontendFrameworks();
    expect(list.map((f) => f.id).sort()).toEqual([...SPA_IDS, "next"].sort());
    expect(
      list
        .filter((f) => f.kind === "vite-spa")
        .map((f) => f.id)
        .sort(),
    ).toEqual([...SPA_IDS].sort());
    expect(list.find((f) => f.id === "next")?.kind).toBe("server");
    for (const meta of ["nuxt", "sveltekit", "astro", "angular"]) {
      expect(list.some((f) => f.id === meta)).toBe(false);
    }
  });

  it("does not mark Next.js verified until the frontend e2e suite passes live", () => {
    expect(listFrontendFrameworks().find((f) => f.id === "next")?.verified).toBe(false);
  });

  it("marks only verified providers as verified", () => {
    expect(VERIFIED_FRONTEND_FRAMEWORKS.every((id) => id in FRONTEND_FRAMEWORKS)).toBe(true);
    expect(
      listFrontendFrameworks()
        .filter((f) => f.id !== "next")
        .every((f) => f.verified),
    ).toBe(true);
  });

  it("the frontend e2e suite's matrix is built from the registry's framework list", () => {
    // The matrix reads the framework axis from the registry (tests/e2e/lib/registry-axes.mjs), so every provider gets a leg.
    const axes = readFileSync(resolve(__dirname, "../../../../tests/e2e/axes.json"), "utf8");
    const values = Object.keys(JSON.parse(axes).axes.frontendFramework.values).sort();
    expect(values).toEqual(Object.keys(FRONTEND_FRAMEWORKS).sort());
  });
});

describe("frontend framework resolution", () => {
  it("defaults to react", () => {
    expect(resolveFrontendFramework("frontend")?.id).toBe("react");
  });

  it("resolves next to the Next.js server provider", () => {
    expect(getFrontendFramework("next", "web").id).toBe("next");
  });

  it("gives a Next.js resource a health probe under its own base path, and a route that answers it", () => {
    const manifest = createServiceJson("fe-next", "frontend", "app", 3000, [], "next");
    expect(manifest.healthCheckPath).toBe("/fe-next/health");
    // A Vite SPA keeps the engine default (/health, served by nginx).
    expect(
      createServiceJson("web", "frontend", "app", 3000, [], "react").healthCheckPath,
    ).toBeUndefined();
    const route = getFrontendFramework("next", "fe-next")
      .createFiles("fe-next")
      .find((f) => f.filename === "src/app/health/route.ts");
    expect(route?.content).toContain("export function GET()");
  });

  it("hands a meta-framework off to bring-your-own", () => {
    try {
      getFrontendFramework("nuxt", "web");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(FliskError);
      const err = e as FliskError;
      expect(err.message).toContain("react, vue");
      expect(JSON.stringify(err)).toContain("flisk resource web --type bring-your-own");
    }
  });

  it("fails closed on an unknown id without a handoff", () => {
    try {
      getFrontendFramework("not-a-framework", "web");
      expect.unreachable();
    } catch (e) {
      const err = e as FliskError;
      expect(err.message).toContain("react, vue");
      expect(JSON.stringify(err)).not.toContain("bring-your-own");
    }
  });
});
