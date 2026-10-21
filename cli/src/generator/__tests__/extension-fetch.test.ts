// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let projectRoot: string;
let destDir: string;
let fakeHome: string;
let fixtureTarball: Buffer;
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;

// Synthetic test credentials only. The network boundary (fetch) is mocked, so
// no real license key is ever needed here - and none may be committed: a real
// key in a public repository is an exposed credential.
const LICENSE_KEY_GRANTED = "tdk-test-key-0001";
const LICENSE_KEY_DENIED = "tdk-test-key-0002";

// Minimal USTAR writer: the fixture archive is assembled in memory with Node
// built-ins only, so the test never shells out to an external `tar` binary
// (not guaranteed to exist on PATH on every platform, e.g. Windows).
const TAR_BLOCK_SIZE = 512;
const TAR_FIXTURE_MTIME = 1_700_000_000;

interface TarEntry {
  /** Path inside the archive; a directory entry has no `content`. */
  path: string;
  content?: string;
}

function tarHeader(entryPath: string, size: number, isDirectory: boolean): Buffer {
  const header = Buffer.alloc(TAR_BLOCK_SIZE);
  header.write(entryPath, 0, 100, "utf-8");
  const mode = isDirectory ? 0o755 : 0o644;
  header.write(`${mode.toString(8).padStart(7, "0")}\0`, 100, 8, "ascii");
  header.write("0000000\0", 108, 8, "ascii");
  header.write("0000000\0", 116, 8, "ascii");
  header.write(`${size.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
  header.write(`${TAR_FIXTURE_MTIME.toString(8).padStart(11, "0")}\0`, 136, 12, "ascii");
  header.write("        ", 148, 8, "ascii");
  header.write(isDirectory ? "5" : "0", 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "utf-8");
  header.write("00", 263, 2, "ascii");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return header;
}

function buildTarGz(entries: TarEntry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const isDirectory = entry.content === undefined;
    const content = Buffer.from(entry.content ?? "", "utf-8");
    blocks.push(tarHeader(entry.path, isDirectory ? 0 : content.byteLength, isDirectory));
    if (isDirectory) continue;
    blocks.push(content);
    const padding = (TAR_BLOCK_SIZE - (content.byteLength % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE;
    if (padding > 0) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(TAR_BLOCK_SIZE * 2));
  return gzipSync(Buffer.concat(blocks));
}

// Mirrors how the real premium.tar.gz is laid out (every entry carries the
// "./" prefix), because extractTarball() strips that leading component.
// Built in memory: no temp directory and no archive file are left behind.
function buildFixtureTarball(): Buffer {
  return buildTarGz([
    { path: "./" },
    { path: "./typescript/" },
    {
      path: "./typescript/playwright_config.star",
      content: "# REAL premium playwright config\ndef generate_playwright_config(): pass\n",
    },
    { path: "./c4_diagram.star", content: "# REAL premium c4 diagram generator\n" },
  ]);
}

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), "flisk-project-"));
  destDir = mkdtempSync(join(tmpdir(), "flisk-dest-"));
  fakeHome = mkdtempSync(join(tmpdir(), "flisk-home-"));

  mkdirSync(join(destDir, "engine/topologies/tilt/generators/typescript"), { recursive: true });
  writeFileSync(
    join(destDir, "engine/topologies/tilt/generators/typescript/playwright_config.star"),
    "# unlicensed stub\n",
  );

  process.env.HOME = fakeHome;
  process.env.USERPROFILE = fakeHome;
  delete process.env.TDK_LICENSE_KEY;
  delete process.env.TDK_PREMIUM_ENDPOINT;
  delete process.env.TDK_PREMIUM_DIAGNOSTICS;
  vi.restoreAllMocks();
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
  rmSync(destDir, { recursive: true, force: true });
  rmSync(fakeHome, { recursive: true, force: true });
  if (originalHome !== undefined) process.env.HOME = originalHome;
  else delete process.env.HOME;
  if (originalUserProfile !== undefined) process.env.USERPROFILE = originalUserProfile;
  else delete process.env.USERPROFILE;
  vi.unstubAllGlobals();
});

describe("applyPremiumOverlay", () => {
  it("scenario 1: no license key -> returns false, never calls fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { applyPremiumOverlay } = await import("../extension-fetch.js");
    const applied = await applyPremiumOverlay(projectRoot, destDir);

    expect(applied).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      readFileSync(
        join(destDir, "engine/topologies/tilt/generators/typescript/playwright_config.star"),
        "utf-8",
      ),
    ).toBe("# unlicensed stub\n");
  });

  it("returns false without fetching when license key is empty or whitespace", async () => {
    process.env.TDK_LICENSE_KEY = "    ";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { applyPremiumOverlay } = await import("../extension-fetch.js");
    const applied = await applyPremiumOverlay(projectRoot, destDir);

    expect(applied).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("scenario 2: invalid/ungranted key -> tries every known resource, then falls back to free tier", async () => {
    process.env.TDK_LICENSE_KEY = LICENSE_KEY_DENIED;

    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      expect(url).toContain(
        "https://tdk-extension-dist.oranguman.workers.dev/v1/premium/bundle.tar.gz",
      );
      return Promise.resolve(new Response("denied", { status: 403 }));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { applyPremiumOverlay } = await import("../extension-fetch.js");
    const applied = await applyPremiumOverlay(projectRoot, destDir);

    expect(applied).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(6);

    const resources = fetchSpy.mock.calls.map((call) => {
      const match = (call[0] as string).match(/resource=([^&]+)/);
      return match ? decodeURIComponent(match[1]) : null;
    });
    expect(resources).toEqual([
      "playwright",
      "c4-diagram",
      "logging",
      "agents-md",
      "sablier",
      "verdaccio",
    ]);

    expect(
      readFileSync(
        join(destDir, "engine/topologies/tilt/generators/typescript/playwright_config.star"),
        "utf-8",
      ),
    ).toBe("# unlicensed stub\n");
  });

  it("scenario 3: valid key granting the first resource -> real files overlay the stubs", async () => {
    process.env.TDK_LICENSE_KEY = LICENSE_KEY_GRANTED;
    fixtureTarball ??= buildFixtureTarball();

    const fetchSpy = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      expect(init?.headers).toEqual({ Authorization: `Bearer ${LICENSE_KEY_GRANTED}` });
      return Promise.resolve(new Response(new Uint8Array(fixtureTarball), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { applyPremiumOverlay } = await import("../extension-fetch.js");
    const applied = await applyPremiumOverlay(projectRoot, destDir);

    expect(applied).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    expect(
      readFileSync(
        join(destDir, "engine/topologies/tilt/generators/typescript/playwright_config.star"),
        "utf-8",
      ),
    ).toContain("REAL premium playwright config");

    expect(
      readFileSync(join(destDir, "engine/topologies/tilt/generators/c4_diagram.star"), "utf-8"),
    ).toContain("REAL premium c4 diagram generator");
  });

  it("uses custom TDK_PREMIUM_ENDPOINT when specified in environment", async () => {
    process.env.TDK_LICENSE_KEY = LICENSE_KEY_GRANTED;
    process.env.TDK_PREMIUM_ENDPOINT = "https://custom-dist.internal/v1/bundle.tar.gz";
    fixtureTarball ??= buildFixtureTarball();

    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      expect(url).toContain("https://custom-dist.internal/v1/bundle.tar.gz");
      return Promise.resolve(new Response(new Uint8Array(fixtureTarball), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { applyPremiumOverlay } = await import("../extension-fetch.js");
    const applied = await applyPremiumOverlay(projectRoot, destDir);
    expect(applied).toBe(true);
  });

  it("stops probing and falls back when server returns an unexpected error code like 500", async () => {
    process.env.TDK_LICENSE_KEY = LICENSE_KEY_GRANTED;
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response("Internal Server Error", { status: 500 }));
    vi.stubGlobal("fetch", fetchSpy);

    const { applyPremiumOverlay } = await import("../extension-fetch.js");
    const applied = await applyPremiumOverlay(projectRoot, destDir);

    expect(applied).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("sends the per-project id and reuses it across calls instead of generating a new one each time", async () => {
    process.env.TDK_LICENSE_KEY = LICENSE_KEY_DENIED;

    const seenProjectIds: string[] = [];
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      const match = (url as string).match(/projectId=([^&]+)/);
      if (match) seenProjectIds.push(decodeURIComponent(match[1]));
      return Promise.resolve(new Response("denied", { status: 403 }));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { applyPremiumOverlay } = await import("../extension-fetch.js");
    await applyPremiumOverlay(projectRoot, destDir);
    await applyPremiumOverlay(projectRoot, destDir);

    const idFile = join(projectRoot, ".tdk", ".project-id");
    expect(existsSync(idFile)).toBe(true);
    const persistedId = readFileSync(idFile, "utf-8").trim();

    expect(new Set(seenProjectIds).size).toBe(1);
    expect(seenProjectIds[0]).toBe(persistedId);
  });

  it("caches a successful fetch and does not re-fetch within the TTL", async () => {
    process.env.TDK_LICENSE_KEY = LICENSE_KEY_GRANTED;
    fixtureTarball ??= buildFixtureTarball();

    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array(fixtureTarball), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const { applyPremiumOverlay } = await import("../extension-fetch.js");
    await applyPremiumOverlay(projectRoot, destDir);
    await applyPremiumOverlay(projectRoot, destDir);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once the cached bundle is older than the TTL", async () => {
    process.env.TDK_LICENSE_KEY = LICENSE_KEY_GRANTED;
    fixtureTarball ??= buildFixtureTarball();

    const fetchSpy = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(new Uint8Array(fixtureTarball), { status: 200 })),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const { applyPremiumOverlay } = await import("../extension-fetch.js");
    await applyPremiumOverlay(projectRoot, destDir);

    const cachedPath = join(
      fakeHome,
      ".tdk",
      "cache",
      `premium-${LICENSE_KEY_GRANTED}`,
      "premium.tar.gz",
    );
    expect(existsSync(cachedPath)).toBe(true);
    const longAgo = new Date(Date.now() - 13 * 60 * 60 * 1000);
    utimesSync(cachedPath, longAgo, longAgo);

    await applyPremiumOverlay(projectRoot, destDir);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("switching keys uses a separate cache instead of serving the other key's bundle", async () => {
    fixtureTarball ??= buildFixtureTarball();

    process.env.TDK_LICENSE_KEY = LICENSE_KEY_GRANTED;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new Uint8Array(fixtureTarball), { status: 200 })),
    );
    const { applyPremiumOverlay } = await import("../extension-fetch.js");
    await applyPremiumOverlay(projectRoot, destDir);

    process.env.TDK_LICENSE_KEY = LICENSE_KEY_DENIED;
    const secondFetch = vi.fn().mockResolvedValue(new Response("not granted", { status: 403 }));
    vi.stubGlobal("fetch", secondFetch);
    const applied = await applyPremiumOverlay(projectRoot, destDir);

    expect(applied).toBe(false);
    expect(secondFetch).toHaveBeenCalled();
  });

  it("a network error is caught, never throws, and falls back to the free tier", async () => {
    process.env.TDK_LICENSE_KEY = LICENSE_KEY_GRANTED;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unreachable")));

    const { applyPremiumOverlay } = await import("../extension-fetch.js");
    await expect(applyPremiumOverlay(projectRoot, destDir)).resolves.toBe(false);
  });

  it("catches extraction failures gracefully when bundle is corrupt", async () => {
    process.env.TDK_LICENSE_KEY = LICENSE_KEY_GRANTED;
    const corruptBuffer = Buffer.from("not a valid gzipped tarball content");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new Uint8Array(corruptBuffer), { status: 200 })),
    );

    const { applyPremiumOverlay } = await import("../extension-fetch.js");
    const applied = await applyPremiumOverlay(projectRoot, destDir);
    expect(applied).toBe(false);
  });

  it("exercises sablier diagnostics branch when TDK_PREMIUM_DIAGNOSTICS is enabled", async () => {
    process.env.TDK_LICENSE_KEY = LICENSE_KEY_GRANTED;
    process.env.TDK_PREMIUM_DIAGNOSTICS = "1";
    fixtureTarball ??= buildFixtureTarball();

    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("resource=sablier")) {
        return Promise.resolve(new Response("denied", { status: 403 }));
      }
      return Promise.resolve(new Response(new Uint8Array(fixtureTarball), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { applyPremiumOverlay } = await import("../extension-fetch.js");
    const applied = await applyPremiumOverlay(projectRoot, destDir);
    expect(applied).toBe(true);
    expect(
      fetchSpy.mock.calls.some(
        ([url]) => typeof url === "string" && url.includes("resource=sablier"),
      ),
    ).toBe(true);
  });
});

describe("license key transport", () => {
  it("retries once with ?key= when a worker that predates the header answers 401", async () => {
    process.env.TDK_LICENSE_KEY = LICENSE_KEY_GRANTED;
    fixtureTarball ??= buildFixtureTarball();
    const fetchSpy = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(
          url.includes(`key=${LICENSE_KEY_GRANTED}`)
            ? new Response(new Uint8Array(fixtureTarball), { status: 200 })
            : new Response("missing key", { status: 401 }),
        ),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const { applyPremiumOverlay } = await import("../extension-fetch.js");
    const applied = await applyPremiumOverlay(projectRoot, destDir);

    expect(applied).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [first, second] = fetchSpy.mock.calls as [string, RequestInit | undefined][];
    expect(first[0]).not.toContain("key=");
    expect(first[1]?.headers).toEqual({ Authorization: `Bearer ${LICENSE_KEY_GRANTED}` });
    expect(second[0]).toContain(`key=${LICENSE_KEY_GRANTED}`);
  });

  it("license checks (hasDddLicense) send the key in the header too", async () => {
    process.env.TDK_LICENSE_KEY = LICENSE_KEY_GRANTED;
    const fetchSpy = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const { hasDddLicense } = await import("../extension-fetch.js");

    expect(await hasDddLicense(projectRoot)).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("resource=ddd");
    expect(url).not.toContain("key=");
    expect(init.headers).toEqual({ Authorization: `Bearer ${LICENSE_KEY_GRANTED}` });
  });

  it("returns false from license checks when no key is configured", async () => {
    delete process.env.TDK_LICENSE_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { hasDddLicense, hasSablierLicense, hasVerdaccioLicense } = await import(
      "../extension-fetch.js"
    );

    expect(await hasDddLicense(projectRoot)).toBe(false);
    expect(await hasSablierLicense(projectRoot)).toBe(false);
    expect(await hasVerdaccioLicense(projectRoot)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("checks verdaccio and sablier licenses directly with caching", async () => {
    process.env.TDK_LICENSE_KEY = LICENSE_KEY_GRANTED;
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("resource=verdaccio")) {
        return Promise.resolve(new Response("granted", { status: 200 }));
      }
      return Promise.resolve(new Response("denied", { status: 403 }));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { hasSablierLicense, hasVerdaccioLicense } = await import("../extension-fetch.js");

    expect(await hasVerdaccioLicense(projectRoot)).toBe(true);
    expect(await hasSablierLicense(projectRoot)).toBe(false);

    // Call again to test cache hit
    expect(await hasVerdaccioLicense(projectRoot)).toBe(true);
    expect(await hasSablierLicense(projectRoot)).toBe(false);

    // fetch was only called twice (once per resource), subsequent checks were cached
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("handles corrupt cache files in live resource checks and falls back to live fetch", async () => {
    process.env.TDK_LICENSE_KEY = LICENSE_KEY_GRANTED;
    const cacheDir = join(fakeHome, ".tdk", "cache", `premium-${LICENSE_KEY_GRANTED}`);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, "ddd-access.json"), "{ invalid-json ");

    const fetchSpy = vi.fn().mockResolvedValue(new Response("granted", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const { hasDddLicense } = await import("../extension-fetch.js");
    expect(await hasDddLicense(projectRoot)).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("handles network failure during live resource license check without throwing", async () => {
    process.env.TDK_LICENSE_KEY = LICENSE_KEY_GRANTED;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection reset")));

    const { hasDddLicense } = await import("../extension-fetch.js");
    expect(await hasDddLicense(projectRoot)).toBe(false);
  });
});
