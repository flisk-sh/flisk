// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

import { type FrontendTarget, isFrontendReady, pickReadyFrontend } from "../open.js";

const targets: FrontendTarget[] = [
  { name: "admin", url: "http://admin.localhost:8080/" },
  { name: "storefront", url: "http://storefront.localhost:8080/" },
];

describe("isFrontendReady", () => {
  it("is false when the URL does not answer", async () => {
    expect(await isFrontendReady("http://127.0.0.1:1/", 200)).toBe(false);
  });
});

describe("pickReadyFrontend", () => {
  it("returns nothing when the project has no frontend", async () => {
    expect(await pickReadyFrontend([], 0)).toBeUndefined();
  });

  it("falls back to the first frontend when none answers yet", async () => {
    const picked = await pickReadyFrontend(targets, 0);
    expect(picked?.name).toBe("admin");
  });
});
