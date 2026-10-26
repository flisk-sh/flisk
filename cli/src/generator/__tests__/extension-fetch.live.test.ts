// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Live check of the default premium endpoint, so a wrong default host (404)
// is caught instead of silently degrading every licensed user to the free
// tier. It talks to the real distribution worker, so it only runs when
// FLISK_E2E_LIVE=1. The granted-key test also needs FLISK_E2E_LICENSE_KEY,
// a key that grants the premium bundle; keep it in CI secrets, never in git.
const live = process.env.FLISK_E2E_LIVE === "1";
const grantedKey = process.env.FLISK_E2E_LICENSE_KEY;

const originalEnv = { ...process.env };
let tmp: string;
let projectRoot: string;
let destDir: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "flisk-premium-live-"));
  projectRoot = join(tmp, "project");
  destDir = join(tmp, "dest");
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(destDir, { recursive: true });
  // The bundle cache lives under the home directory: keep it out of the real one.
  process.env.HOME = tmp;
  process.env.USERPROFILE = tmp;
  delete process.env.FLISK_PREMIUM_ENDPOINT;
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
  rmSync(tmp, { recursive: true, force: true });
});

describe.skipIf(!live)("premium endpoint (live)", () => {
  it("reaches the worker with the default endpoint and is denied an unknown key", async () => {
    process.env.FLISK_LICENSE_KEY = "flisk-e2e-unknown-key";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const { applyPremiumOverlay } = await import("../extension-fetch.js");
    const applied = await applyPremiumOverlay(projectRoot, destDir);

    const output = [...warn.mock.calls, ...info.mock.calls].flat().join("\n");
    expect(applied).toBe(false);
    // 403/401 means the worker answered; 404 means the default host is dead.
    expect(output).not.toMatch(/HTTP 404|network error/);
    expect(output).toMatch(/entitlement probes denied: playwright=40[13]/);
  });

  it.skipIf(!grantedKey)(
    "downloads and applies the premium bundle for a granted key",
    async () => {
      process.env.FLISK_LICENSE_KEY = grantedKey;

      const { applyPremiumOverlay } = await import("../extension-fetch.js");
      const applied = await applyPremiumOverlay(projectRoot, destDir);

      expect(applied).toBe(true);
      expect(
        existsSync(
          join(destDir, "engine/topologies/tilt/generators/typescript/playwright_config.star"),
        ),
      ).toBe(true);
    },
    120_000,
  );
});
