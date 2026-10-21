// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

import { type FrontendTarget, isFrontendReady, pickReadyFrontend } from "../open.js";

// Port 9 (discard) is closed on every machine, so nothing answers here.
const targets: FrontendTarget[] = [
  { name: "admin", url: "http://127.0.0.1:9/" },
  { name: "storefront", url: "http://127.0.0.1:9/" },
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

  it("returns nothing when no frontend answers within the wait", async () => {
    const picked = await pickReadyFrontend(targets, 0);
    expect(picked).toBeUndefined();
  });

  it("reports the wait while it polls", async () => {
    const seen: number[] = [];
    await pickReadyFrontend(targets, 10, (elapsed) => seen.push(elapsed));
    expect(seen.length).toBeGreaterThan(0);
  });
});
