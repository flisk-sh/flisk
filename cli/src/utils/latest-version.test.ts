// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkLatestFliskVersion } from "../commands/doctor.js";
import {
  describeInstallLocation,
  fetchLatestVersion,
  isOlderVersion,
  LATEST_VERSION_CACHE_FILE,
  staleVersionNotice,
} from "./latest-version.js";

let cacheDir: string;
const env = {} as NodeJS.ProcessEnv;
const argv: string[] = ["node", "flisk", "demo"];

function registry(version: string): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify({ version }), { status: 200 })) as never;
}

beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), "flisk-latest-"));
});
afterEach(() => {
  rmSync(cacheDir, { recursive: true, force: true });
});

describe("isOlderVersion", () => {
  it("compares x.y.z numerically", () => {
    expect(isOlderVersion("1.3.207", "1.4.61")).toBe(true);
    expect(isOlderVersion("1.4.61", "1.4.61")).toBe(false);
    expect(isOlderVersion("1.4.62", "1.4.61")).toBe(false);
    expect(isOlderVersion("1.4.9", "1.4.10")).toBe(true);
  });
  it("never claims old for a version it cannot read", () => {
    expect(isOlderVersion("1.4.61-beta.1", "1.4.61")).toBe(false);
    expect(isOlderVersion("1.0.0", "garbage")).toBe(false);
  });
});

describe("staleVersionNotice", () => {
  const base = { env, argv, scriptPath: "/home/u/node_modules/.bin/flisk" };

  it("prints the notice when the running version is older", async () => {
    const notice = await staleVersionNotice("1.3.207", {
      ...base,
      cacheDir,
      fetchImpl: registry("1.4.61"),
    });
    expect(notice).toContain("You are running flisk 1.3.207");
    expect(notice).toContain("1.4.61 is out");
    expect(notice).toContain("npx @flisk-sh/flisk@latest demo");
    expect(notice).toContain("/home/u/node_modules");
  });

  it("prints nothing when equal or newer", async () => {
    expect(
      await staleVersionNotice("1.4.61", { ...base, cacheDir, fetchImpl: registry("1.4.61") }),
    ).toBeNull();
    expect(
      await staleVersionNotice("1.5.0", { ...base, cacheDir, fetchImpl: registry("1.4.61") }),
    ).toBeNull();
  });

  it("prints nothing and stays under 1 s when the registry hangs", async () => {
    const hang = vi.fn(() => new Promise<Response>(() => {})) as never;
    const started = Date.now();
    const notice = await staleVersionNotice("1.3.207", { ...base, cacheDir, fetchImpl: hang });
    expect(notice).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("prints nothing when the registry fails or answers badly", async () => {
    const down = vi.fn(async () => {
      throw new Error("offline");
    }) as never;
    expect(await staleVersionNotice("1.0.0", { ...base, cacheDir, fetchImpl: down })).toBeNull();
    const bad = vi.fn(async () => new Response("nope", { status: 500 })) as never;
    expect(await staleVersionNotice("1.0.0", { ...base, cacheDir, fetchImpl: bad })).toBeNull();
  });
});

describe("fetchLatestVersion", () => {
  it("skips the registry on CI, FLISK_OFFLINE and --offline", async () => {
    const fetchImpl = registry("9.9.9");
    expect(await fetchLatestVersion({ env: { CI: "true" }, argv, cacheDir, fetchImpl })).toBeNull();
    expect(
      await fetchLatestVersion({ env: { FLISK_OFFLINE: "1" }, argv, cacheDir, fetchImpl }),
    ).toBeNull();
    expect(
      await fetchLatestVersion({ env, argv: [...argv, "--offline"], cacheDir, fetchImpl }),
    ).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("caches the answer for a day", async () => {
    const fetchImpl = registry("1.4.61");
    const now = 1_000_000;
    expect(await fetchLatestVersion({ env, argv, cacheDir, fetchImpl, now })).toBe("1.4.61");
    expect(JSON.parse(readFileSync(join(cacheDir, LATEST_VERSION_CACHE_FILE), "utf-8"))).toEqual({
      version: "1.4.61",
      checkedAt: now,
    });
    expect(await fetchLatestVersion({ env, argv, cacheDir, fetchImpl, now: now + 3_600_000 })).toBe(
      "1.4.61",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const next = registry("1.4.62");
    expect(
      await fetchLatestVersion({ env, argv, cacheDir, fetchImpl: next, now: now + 25 * 3_600_000 }),
    ).toBe("1.4.62");
  });

  it("ignores a corrupt cache", async () => {
    writeFileSync(join(cacheDir, LATEST_VERSION_CACHE_FILE), "{not json");
    expect(await fetchLatestVersion({ env, argv, cacheDir, fetchImpl: registry("1.4.61") })).toBe(
      "1.4.61",
    );
  });
});

describe("describeInstallLocation", () => {
  it("names the node_modules folder, with ~ for home", () => {
    expect(describeInstallLocation("/Users/a/node_modules/.bin/flisk", "/Users/a")).toBe(
      "~/node_modules",
    );
    expect(
      describeInstallLocation("/usr/lib/node_modules/@flisk-sh/flisk/dist/cli.js", "/Users/a"),
    ).toBe("/usr/lib/node_modules");
    expect(describeInstallLocation("/opt/flisk/cli.js", "/Users/a")).toBeNull();
  });
});

describe("checkLatestFliskVersion (doctor)", () => {
  it("warns, without failing, when the CLI is older", async () => {
    const result = await checkLatestFliskVersion("1.3.207", async () => "1.4.61");
    expect(result.didPass).toBe(true);
    expect(result.isWarning).toBe(true);
    expect(result.message).toContain("1.4.61");
  });
  it("is quiet when current and skipped when the registry is unknown", async () => {
    const current = await checkLatestFliskVersion("1.4.61", async () => "1.4.61");
    expect(current.isWarning).toBeFalsy();
    const unknown = await checkLatestFliskVersion("1.4.61", async () => null);
    expect(unknown.isSkipped).toBe(true);
  });
});
