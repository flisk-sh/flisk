// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureExit } from "../../test-support/doubles.js";
import { ProcessExitError } from "../../utils/errors.js";

const execSyncMock = vi.fn();
const execFileSyncMock = vi.fn();
vi.mock("node:child_process", () => ({
  execSync: (...args: unknown[]) => execSyncMock(...args),
  execFileSync: (...args: unknown[]) => execFileSyncMock(...args),
}));
vi.mock("../../utils/tar.js", () => ({
  extractTarball: (_data: Buffer, destination: string) => {
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(destination, "engine-marker"), "extracted");
  },
}));

const promptConfirmMock = vi.fn(async (_opts?: unknown): Promise<boolean> => true);
vi.mock("../../utils/prompt.js", () => ({
  promptConfirm: (opts: unknown) => promptConfirmMock(opts),
}));

const findOnPathMock = vi.fn((_cmd: string): string | null => null);
const findAllOnPathMock = vi.fn((_cmd: string): string[] => []);
vi.mock("../../utils/which.js", () => ({
  findOnPath: (cmd: string) => findOnPathMock(cmd),
  findAllOnPath: (cmd: string) => findAllOnPathMock(cmd),
}));

const getPackageVersionMock = vi.fn((): string => "1.3.186");
vi.mock("../../utils/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/paths.js")>();
  return {
    ...actual,
    getPackageVersion: () => getPackageVersionMock(),
  };
});

const platformMock = {
  isWindows: vi.fn((): boolean => process.platform === "win32"),
  binaryAssetName: vi.fn((): string | null =>
    process.platform === "win32" ? "tdk-windows-amd64.exe" : "tdk-darwin-arm64",
  ),
  executableName: vi.fn((): string => (process.platform === "win32" ? "tdk.exe" : "flisk")),
};
vi.mock("../../utils/platform.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/platform.js")>();
  return {
    ...actual,
    isWindows: () => platformMock.isWindows(),
    binaryAssetName: () => platformMock.binaryAssetName(),
    executableName: () => platformMock.executableName(),
  };
});

const {
  classifyRunningInstall,
  createUpgradeCommand,
  detectAllInstallations,
  detectInstallation,
  detectInstallationForPath,
  getCurrentVersion,
  getLatestBinaryRelease,
  getLatestVersion,
  isPermissionError,
  isStandaloneBinary,
  isWritable,
  parseChecksums,
  upgradeAllInstallations,
  upgradeCommand,
  upgradeViaBinary,
  upgradeViaBun,
  upgradeViaGit,
  upgradeViaNpm,
  windowsNpmUpgradeMessage,
} = await import("../upgrade.js");

import type { BinaryRelease } from "../upgrade.js";

// Regression coverage for: `flisk upgrade` used to only swap the `flisk` binary
// and leave the bundled tdk-cli/ engine+templates folder next to it stale or
// missing, so an upgraded binary still crashed with the loadTemplate ENOENT
// (the exact error this was meant to fix). It must refresh both, every time.
const BINARY_BYTES = "fake flisk binary";
const ENGINE_BYTES = "fake engine tarball";
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

describe("upgradeViaBinary", () => {
  let installDir: string;
  let tdkPath: string;
  let release: BinaryRelease;
  let checksums: string;
  const fetchMock = vi.fn();

  beforeEach(() => {
    installDir = mkdtempSync(join(tmpdir(), "tdk-upgrade-test-"));
    tdkPath = join(installDir, "flisk");
    release = {
      tag: "v1.3.21",
      assetName: "tdk-darwin-arm64",
      downloadUrl: "https://example.test/tdk-darwin-arm64",
      engineDownloadUrl: "https://example.test/tdk-cli-engine.tar.gz",
      checksumsUrl: "https://example.test/checksums.txt",
    };
    checksums = [
      `${sha256(BINARY_BYTES)}  tdk-darwin-arm64`,
      `${sha256("other platform")}  tdk-linux-amd64`,
      `${sha256(ENGINE_BYTES)}  tdk-cli-engine.tar.gz`,
    ].join("\n");
    execSyncMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        Buffer.from(url === release.engineDownloadUrl ? ENGINE_BYTES : BINARY_BYTES),
      text: async () => checksums,
    }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    rmSync(installDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it("downloads and extracts the bundled engine tarball next to the binary, not just the binary itself", async () => {
    const ok = await upgradeViaBinary(tdkPath, release);
    expect(ok).toBe(true);

    const engineDir = join(installDir, "tdk-cli");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      release.downloadUrl,
      release.engineDownloadUrl,
      release.checksumsUrl,
    ]);
    expect(readFileSync(tdkPath, "utf-8")).toBe(BINARY_BYTES);
    expect(readFileSync(join(engineDir, "engine-marker"), "utf-8")).toBe("extracted");
  });

  it.skipIf(process.platform === "win32")(
    "installs the binary with the executable bit set",
    async () => {
      const ok = await upgradeViaBinary(tdkPath, release);
      expect(ok).toBe(true);
      expect(statSync(tdkPath).mode & 0o111).toBe(0o111);
    },
  );

  it("downloads both the binary and the engine tarball before installing either", async () => {
    await upgradeViaBinary(tdkPath, release);

    expect(fetchMock).toHaveBeenNthCalledWith(1, release.downloadUrl, expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(2, release.engineDownloadUrl, expect.any(Object));
    expect(readFileSync(tdkPath, "utf-8")).toBe(BINARY_BYTES);
  });

  it("verifies checksums after both downloads and before installing anything", async () => {
    await upgradeViaBinary(tdkPath, release);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      release.downloadUrl,
      release.engineDownloadUrl,
      release.checksumsUrl,
    ]);
    expect(existsSync(tdkPath)).toBe(true);
  });

  it.each([
    [
      "the binary does not match",
      () => checksums.replace(sha256(BINARY_BYTES), sha256("tampered")),
    ],
    [
      "the engine tarball does not match",
      () => checksums.replace(sha256(ENGINE_BYTES), sha256("x")),
    ],
    ["checksums.txt has no entry for the binary", () => checksums.replace("tdk-darwin-arm64", "x")],
  ])("refuses to install when %s", async (_case, makeChecksums) => {
    checksums = makeChecksums();
    const ok = await upgradeViaBinary(tdkPath, release);

    expect(ok).toBe(false);
    expect(existsSync(tdkPath)).toBe(false);
  });

  it("still installs releases whose checksums.txt predates the engine entry", async () => {
    checksums = checksums
      .split("\n")
      .filter((line) => !line.endsWith("tdk-cli-engine.tar.gz"))
      .join("\n");
    const ok = await upgradeViaBinary(tdkPath, release);

    expect(ok).toBe(true);
    expect(existsSync(tdkPath)).toBe(true);
  });

  it.each([
    ["the engine tarball", () => release.engineDownloadUrl],
    ["checksums.txt", () => release.checksumsUrl],
  ])("leaves the existing install alone when %s download fails", async (_case, failingUrl) => {
    writeFileSync(tdkPath, "old binary");
    const url = failingUrl();
    fetchMock.mockImplementation(async (requested: string) =>
      requested === url
        ? { ok: false, status: 503 }
        : {
            ok: true,
            status: 200,
            arrayBuffer: async () =>
              Buffer.from(requested === release.engineDownloadUrl ? ENGINE_BYTES : BINARY_BYTES),
            text: async () => checksums,
          },
    );

    const ok = await upgradeViaBinary(tdkPath, release);

    expect(ok).toBe(false);
    expect(readFileSync(tdkPath, "utf-8")).toBe("old binary");
    expect(existsSync(join(installDir, "tdk-cli"))).toBe(false);
  });

  it("replaces an existing binary and engine folder and removes both backups", async () => {
    writeFileSync(tdkPath, "old binary");
    const engineDir = join(installDir, "tdk-cli");
    mkdirSync(engineDir);
    writeFileSync(join(engineDir, "old-engine-file"), "old");

    const ok = await upgradeViaBinary(tdkPath, release);

    expect(ok).toBe(true);
    expect(readFileSync(tdkPath, "utf-8")).toBe(BINARY_BYTES);
    expect(readFileSync(join(engineDir, "engine-marker"), "utf-8")).toBe("extracted");
    expect(existsSync(join(engineDir, "old-engine-file"))).toBe(false);
    const leftovers = readdirSync(installDir).filter(
      (name) => name !== "flisk" && name !== "tdk-cli",
    );
    expect(leftovers).toEqual([]);
  });

  // root ignores the write-permission bit (accessSync(W_OK) legitimately
  // returns true even on a 0o555 dir), so these checks only hold for
  // non-root users.
  const isRoot = process.getuid?.() === 0;

  it.skipIf(isRoot)(
    "never shells out to sudo, and fails fast without touching the network when the install dir isn't writable",
    async () => {
      chmodSync(installDir, 0o555);
      try {
        const ok = await upgradeViaBinary(tdkPath, release);
        expect(ok).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        chmodSync(installDir, 0o755);
      }
    },
  );

  it.skipIf(isRoot)("isWritable reflects actual filesystem permissions", () => {
    expect(isWritable(installDir)).toBe(true);
    chmodSync(installDir, 0o555);
    try {
      expect(isWritable(installDir)).toBe(false);
    } finally {
      chmodSync(installDir, 0o755);
    }
  });
});

describe("package-manager upgrade failures", () => {
  it("does not switch to the GitHub default branch when npm install fails", async () => {
    execSyncMock.mockReset();
    const npmStderr = "npm error code EACCES: permission denied\n";
    // The legacy-package removal runs first and fails silently; the install fails and is reported.
    execSyncMock.mockImplementationOnce(() => {
      throw new Error("Command failed: npm uninstall -g @tdk-landscape/tdk-cli-core");
    });
    execSyncMock.mockImplementationOnce(() => {
      const error = new Error("Command failed: npm install -g @flisk-sh/flisk@latest");
      Object.assign(error, { stderr: Buffer.from(npmStderr) });
      throw error;
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    try {
      const ok = await upgradeViaNpm();
      expect(ok).toBe(false);
      // The legacy package owns the old `flisk` command and blocks the install, so it goes first.
      expect(String(execSyncMock.mock.calls[0]?.[0])).toBe(
        "npm uninstall -g @tdk-landscape/tdk-cli-core",
      );
      expect(String(execSyncMock.mock.calls[1]?.[0])).toBe("npm install -g @flisk-sh/flisk@latest");
      expect(execSyncMock.mock.calls[1]?.[1]).toMatchObject({
        stdio: ["inherit", "inherit", "pipe"],
      });
      expect(stderr).toHaveBeenCalledWith(npmStderr);
      const output = log.mock.calls.flat().map(String).join("\n");
      expect(output).toContain("npm install -g @flisk-sh/flisk@latest");
      expect(output).toContain("docs.npmjs.com");
      expect(output).not.toContain("github:");
      expect(output).not.toContain("Upgraded successfully");
    } finally {
      stderr.mockRestore();
      log.mockRestore();
    }
  });

  it("does not switch to the GitHub default branch when Bun install fails", async () => {
    execFileSyncMock.mockReset();
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("registry unavailable");
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      const ok = await upgradeViaBun();
      expect(ok).toBe(false);
      expect(execFileSyncMock).toHaveBeenCalledTimes(1);
      expect(execFileSyncMock.mock.calls[0]?.[1]).toEqual([
        "install",
        "-g",
        "@flisk-sh/flisk@latest",
      ]);
      const output = log.mock.calls.flat().map(String).join("\n");
      expect(output).toContain("bun install -g @flisk-sh/flisk@latest");
      expect(output).not.toContain("github:");
      expect(output).not.toContain("Upgraded successfully");
    } finally {
      log.mockRestore();
    }
  });
});

describe("parseChecksums", () => {
  it("reads both text-mode and binary-mode (*name) shasum lines and ignores junk", () => {
    const a = "a".repeat(64);
    const b = "B".repeat(64);
    const sums = parseChecksums(
      `${a}  tdk-linux-amd64\n${b} *tdk-cli-engine.tar.gz\n\nnot a checksum line\n`,
    );

    expect(sums.get("tdk-linux-amd64")).toBe(a);
    expect(sums.get("tdk-cli-engine.tar.gz")).toBe("b".repeat(64));
    expect(sums.size).toBe(2);
  });
});

describe("Windows upgrade installation routing", () => {
  it("recognizes a compiled Windows CLI executable", () => {
    expect(classifyRunningInstall("C:\\Users\\dev\\tdk.exe", "", "win32")).toEqual({
      method: "binary",
      path: "C:\\Users\\dev\\tdk.exe",
    });
  });

  it("recognizes an npm-installed Node entry point", () => {
    expect(
      classifyRunningInstall(
        "C:\\Program Files\\nodejs\\node.exe",
        "C:\\Users\\dev\\node_modules\\@flisk-sh\\flisk\\bin\\tdk.js",
        "win32",
      ),
    ).toEqual({
      method: "npm",
      path: "C:\\Users\\dev\\node_modules\\@flisk-sh\\flisk\\bin\\tdk.js",
    });
  });

  it("prints the npm update command instead of replacing npm files with an exe", () => {
    expect(windowsNpmUpgradeMessage("win32", { method: "npm" })).toBe(
      "use npm install -g @flisk-sh/flisk@latest",
    );
  });
});

describe("isPermissionError", () => {
  it("returns true for EACCES and EPERM errors", () => {
    expect(isPermissionError({ code: "EACCES" })).toBe(true);
    expect(isPermissionError({ code: "EPERM" })).toBe(true);
  });

  it("returns false for other codes or non-objects", () => {
    expect(isPermissionError({ code: "ENOENT" })).toBe(false);
    expect(isPermissionError(new Error("Generic"))).toBe(false);
    expect(isPermissionError(null)).toBe(false);
    expect(isPermissionError("error")).toBe(false);
  });
});

describe("isStandaloneBinary", () => {
  it("returns true on Windows when path ends with .exe", () => {
    platformMock.isWindows.mockReturnValueOnce(true);
    expect(isStandaloneBinary("C:\\bin\\tdk.exe")).toBe(true);
  });

  it("returns true on Unix when file command outputs Mach-O or ELF", () => {
    platformMock.isWindows.mockReturnValue(false);
    execFileSyncMock.mockReturnValueOnce("Mach-O 64-bit arm64 executable");
    expect(isStandaloneBinary("/usr/local/bin/tdk")).toBe(true);

    execFileSyncMock.mockReturnValueOnce("ELF 64-bit LSB executable, x86-64");
    expect(isStandaloneBinary("/usr/local/bin/tdk")).toBe(true);
  });

  it("returns false on Unix when file command outputs text or throws", () => {
    platformMock.isWindows.mockReturnValue(false);
    execFileSyncMock.mockReturnValueOnce("POSIX shell script, ASCII text executable");
    expect(isStandaloneBinary("/usr/local/bin/tdk")).toBe(false);

    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("file not found");
    });
    expect(isStandaloneBinary("/usr/local/bin/tdk")).toBe(false);
  });
});

describe("getCurrentVersion", () => {
  it("returns the package version when getPackageVersion succeeds", () => {
    getPackageVersionMock.mockReturnValueOnce("1.3.186");
    expect(getCurrentVersion()).toBe("1.3.186");
  });

  it("returns 'unknown' when getPackageVersion throws", () => {
    getPackageVersionMock.mockImplementationOnce(() => {
      throw new Error("package.json not found");
    });
    expect(getCurrentVersion()).toBe("unknown");
  });
});

describe("getLatestBinaryRelease", () => {
  it("returns null when binaryAssetName() returns null", async () => {
    platformMock.binaryAssetName.mockReturnValueOnce(null);
    expect(await getLatestBinaryRelease()).toBeNull();
  });

  it("returns null when GitHub API responds with non-ok status", async () => {
    platformMock.binaryAssetName.mockReturnValueOnce("tdk-darwin-arm64");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
      }),
    );
    expect(await getLatestBinaryRelease()).toBeNull();
  });

  it("returns null when response json does not contain tag_name", async () => {
    platformMock.binaryAssetName.mockReturnValueOnce("tdk-darwin-arm64");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      }),
    );
    expect(await getLatestBinaryRelease()).toBeNull();
  });

  it("returns null when fetch throws an error", async () => {
    platformMock.binaryAssetName.mockReturnValueOnce("tdk-darwin-arm64");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("network timeout")));
    expect(await getLatestBinaryRelease()).toBeNull();
  });

  it("returns a binary release object when release is found", async () => {
    platformMock.binaryAssetName.mockReturnValueOnce("tdk-darwin-arm64");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tag_name: "v1.4.0" }),
      }),
    );
    const release = await getLatestBinaryRelease();
    expect(release).toEqual({
      tag: "v1.4.0",
      assetName: "tdk-darwin-arm64",
      downloadUrl: "https://github.com/flisk-sh/releases/releases/download/v1.4.0/tdk-darwin-arm64",
      engineDownloadUrl:
        "https://github.com/flisk-sh/releases/releases/download/v1.4.0/tdk-cli-engine.tar.gz",
      checksumsUrl: "https://github.com/flisk-sh/releases/releases/download/v1.4.0/checksums.txt",
    });
  });
});

describe("getLatestVersion", () => {
  it("on Unix: returns trimmed version from npm view", async () => {
    platformMock.isWindows.mockReturnValueOnce(false);
    execSyncMock.mockReturnValueOnce("1.4.5\n");
    expect(await getLatestVersion()).toBe("1.4.5");
  });

  it("on Unix: returns null when npm view fails", async () => {
    platformMock.isWindows.mockReturnValueOnce(false);
    execSyncMock.mockImplementationOnce(() => {
      throw new Error("npm connection timeout");
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(await getLatestVersion()).toBeNull();
    } finally {
      logSpy.mockRestore();
    }
  });

  it("on Windows: returns version from npm registry fetch", async () => {
    platformMock.isWindows.mockReturnValueOnce(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: "1.4.6" }),
      }),
    );
    expect(await getLatestVersion()).toBe("1.4.6");
  });

  it("on Windows: returns null when npm registry fetch fails or returns missing version", async () => {
    platformMock.isWindows.mockReturnValue(true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: false,
          status: 503,
        }),
      );
      expect(await getLatestVersion()).toBeNull();

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        }),
      );
      expect(await getLatestVersion()).toBeNull();
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe("detectInstallation and detectInstallationForPath", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tdk-detect-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("detects git install when path is in a tdk-cli checkout with .git", () => {
    const gitRoot = join(tempDir, "tdk-cli-repo");
    const binDir = join(gitRoot, "tdk-cli", "bin");
    mkdirSync(join(gitRoot, ".git"), { recursive: true });
    mkdirSync(binDir, { recursive: true });
    const fakeBin = join(binDir, "flisk");
    writeFileSync(fakeBin, "#!/bin/sh");

    const info = detectInstallationForPath(fakeBin);
    expect(info.method).toBe("git");
    expect(info.path).toBe(realpathSync(gitRoot));
  });

  it("detects bun installation when path contains .bun", () => {
    const bunBin = join(tempDir, ".bun", "bin", "flisk");
    mkdirSync(dirname(bunBin), { recursive: true });
    writeFileSync(bunBin, "#!/bin/sh");

    const info = detectInstallationForPath(bunBin);
    expect(info).toEqual({ method: "bun", path: bunBin });
  });

  it("detects npm installation when path contains node_modules or .npm", () => {
    const npmBin = join(tempDir, "node_modules", ".bin", "flisk");
    mkdirSync(dirname(npmBin), { recursive: true });
    writeFileSync(npmBin, "#!/bin/sh");

    const info = detectInstallationForPath(npmBin);
    expect(info).toEqual({ method: "npm", path: npmBin });
  });

  it("detects binary install when isStandaloneBinary returns true", () => {
    const binPath = join(tempDir, "standalone-tdk");
    writeFileSync(binPath, "ELF");
    execFileSyncMock.mockReturnValueOnce("ELF 64-bit executable");

    const info = detectInstallationForPath(binPath);
    expect(info.method).toBe("binary");
  });

  it("detectInstallation returns unknown when findOnPath returns null", () => {
    const origArgv1 = process.argv[1];
    process.argv[1] = "";
    try {
      findOnPathMock.mockReturnValueOnce(null);
      const info = detectInstallation();
      expect(info.method).toBe("unknown");
    } finally {
      process.argv[1] = origArgv1;
    }
  });
});

describe("detectAllInstallations", () => {
  it("deduplicates multiple binary entries and ignores unknown", () => {
    findOnPathMock.mockReturnValue(null);
    findAllOnPathMock.mockReturnValueOnce([
      "/usr/local/bin/tdk",
      "/usr/bin/tdk",
      "/nonexistent/tdk",
    ]);
    execFileSyncMock.mockReturnValue("Mach-O 64-bit arm64 executable");

    const all = detectAllInstallations();
    expect(Array.isArray(all)).toBe(true);
  });
});

describe("upgradeViaGit", () => {
  let gitRepoDir: string;

  beforeEach(() => {
    gitRepoDir = mkdtempSync(join(tmpdir(), "tdk-git-test-"));
    mkdirSync(join(gitRepoDir, ".git"), { recursive: true });
    mkdirSync(join(gitRepoDir, "cli"), { recursive: true });
    writeFileSync(join(gitRepoDir, "cli", "package.json"), "{}");
    execFileSyncMock.mockReset();
  });

  afterEach(() => {
    rmSync(gitRepoDir, { recursive: true, force: true });
  });

  it("fails and warns when checkout is dirty", async () => {
    execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "rev-parse" && args[1] === "--git-dir") return ".git";
      if (args[0] === "fetch") return "";
      if (args[0] === "status" && args[1] === "--porcelain") return " M cli/src/foo.ts\n";
      return "";
    });

    const ok = await upgradeViaGit(gitRepoDir);
    expect(ok).toBe(false);
  });

  it("fast-forwards, rebuilds and relinks when on default branch", async () => {
    execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "rev-parse" && args[1] === "--git-dir") return ".git";
      if (args[0] === "fetch") return "";
      if (args[0] === "status" && args[1] === "--porcelain") return "";
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return "main\n";
      if (args[0] === "symbolic-ref") return "origin/main\n";
      if (args[0] === "pull") return "";
      if (args[0] === "install") return "";
      if (args[0] === "run") return "";
      if (args[0] === "link") return "";
      return "";
    });

    const ok = await upgradeViaGit(gitRepoDir);
    expect(ok).toBe(true);
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "git",
      ["pull", "--ff-only", "origin", "main"],
      expect.any(Object),
    );
  });

  it("rebases feature branch onto default branch and rebuilds", async () => {
    execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "rev-parse" && args[1] === "--git-dir") return ".git";
      if (args[0] === "fetch") return "";
      if (args[0] === "status" && args[1] === "--porcelain") return "";
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return "feature/test\n";
      if (args[0] === "symbolic-ref") return "origin/main\n";
      if (args[0] === "rebase") return "";
      if (args[0] === "install") return "";
      if (args[0] === "run") return "";
      if (args[0] === "link") return "";
      return "";
    });

    const ok = await upgradeViaGit(gitRepoDir);
    expect(ok).toBe(true);
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "git",
      ["rebase", "origin/main"],
      expect.any(Object),
    );
  });

  it("aborts rebase when rebase encounters a conflict", async () => {
    execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "rev-parse" && args[1] === "--git-dir") return ".git";
      if (args[0] === "fetch") return "";
      if (args[0] === "status" && args[1] === "--porcelain") return "";
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return "feature/conflict\n";
      if (args[0] === "symbolic-ref") return "origin/main\n";
      if (args[0] === "rebase" && args[1] === "origin/main") {
        throw new Error("rebase conflict");
      }
      return "";
    });

    const ok = await upgradeViaGit(gitRepoDir);
    expect(ok).toBe(false);
    expect(execFileSyncMock).toHaveBeenCalledWith("git", ["rebase", "--abort"], expect.any(Object));
  });

  it("falls back to candidate branches when symbolic-ref fails", async () => {
    execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "rev-parse" && args[1] === "--git-dir") return ".git";
      if (args[0] === "fetch") return "";
      if (args[0] === "status" && args[1] === "--porcelain") return "";
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return "main\n";
      if (args[0] === "symbolic-ref") throw new Error("not symbolic ref");
      if (args[0] === "rev-parse" && args[1] === "--verify" && args[2] === "origin/main")
        return "hash";
      if (args[0] === "pull") return "";
      return "";
    });

    const ok = await upgradeViaGit(gitRepoDir);
    expect(ok).toBe(true);
  });

  it("fails when no default branch can be determined", async () => {
    execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "rev-parse" && args[1] === "--git-dir") return ".git";
      if (args[0] === "fetch") return "";
      if (args[0] === "status" && args[1] === "--porcelain") return "";
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return "main\n";
      if (args[0] === "symbolic-ref") throw new Error("not symbolic ref");
      if (args[0] === "rev-parse" && args[1] === "--verify") throw new Error("not found");
      return "";
    });

    const ok = await upgradeViaGit(gitRepoDir);
    expect(ok).toBe(false);
  });
});

describe("upgradeAllInstallations", () => {
  let tempDir: string;
  const origArgv1 = process.argv[1];

  beforeEach(() => {
    process.argv[1] = "";
    tempDir = mkdtempSync(join(tmpdir(), "tdk-all-test-"));
  });

  afterEach(() => {
    process.argv[1] = origArgv1;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns false when no installations are detected", async () => {
    findAllOnPathMock.mockReturnValue([]);
    findOnPathMock.mockReturnValue(null);

    const logErr = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const ok = await upgradeAllInstallations(false);
      expect(ok).toBe(false);
    } finally {
      logErr.mockRestore();
    }
  });

  it("returns true on dry-run without performing upgrades", async () => {
    const binPath = join(tempDir, "flisk");
    writeFileSync(binPath, "ELF");
    findAllOnPathMock.mockReturnValue([binPath]);
    findOnPathMock.mockReturnValue(null);
    execFileSyncMock.mockReturnValue("Mach-O 64-bit arm64");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const ok = await upgradeAllInstallations(true);
      expect(ok).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("skips updating binary when already current, and updates npm and bun", async () => {
    const binPath = join(tempDir, "flisk");
    writeFileSync(binPath, "ELF");
    const npmPath = join(tempDir, "node_modules", ".bin", "flisk");
    mkdirSync(dirname(npmPath), { recursive: true });
    writeFileSync(npmPath, "#!/bin/sh");
    findAllOnPathMock.mockReturnValue([binPath, npmPath]);
    findOnPathMock.mockReturnValue(null);
    execFileSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "file") return "ELF 64-bit executable";
      if (args?.[0] === "version") return "1.4.0\n";
      return "";
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tag_name: "v1.4.0" }),
      }),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const ok = await upgradeAllInstallations(false);
      expect(ok).toBe(true);
      const text = logSpy.mock.calls.flat().join(" ");
      expect(text).toContain("is already current");
      expect(text).toContain("All Flisk installations on PATH are up to date.");
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe("upgradeCommand action handler", () => {
  let tmp: string;
  const origArgv1 = process.argv[1];
  const origExecPath = process.execPath;
  const origPlatform = process.platform;

  beforeEach(() => {
    process.argv[1] = "";
    Object.defineProperty(process, "execPath", {
      value: "/usr/local/bin/node",
      configurable: true,
    });
    Object.defineProperty(process, "platform", { value: origPlatform, configurable: true });
    tmp = mkdtempSync(join(tmpdir(), "tdk-cmd-test-"));
    execSyncMock.mockReset();
    execFileSyncMock.mockReset();
    findOnPathMock.mockReset();
    findAllOnPathMock.mockReset();
    promptConfirmMock.mockReset();
    promptConfirmMock.mockResolvedValue(true);
    getPackageVersionMock.mockReturnValue("1.3.186");
    platformMock.isWindows.mockReturnValue(false);
    platformMock.binaryAssetName.mockReturnValue("tdk-darwin-arm64");
    platformMock.executableName.mockReturnValue("flisk");
  });

  afterEach(() => {
    process.argv[1] = origArgv1;
    Object.defineProperty(process, "execPath", { value: origExecPath, configurable: true });
    Object.defineProperty(process, "platform", { value: origPlatform, configurable: true });
    rmSync(tmp, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  async function runUpgrade(
    args: string[] = [],
  ): Promise<{ status: number | undefined; stdout: string; stderr: string }> {
    const exit = captureExit();
    let stdout = "";
    let stderr = "";
    const logSpy = vi.spyOn(console, "log").mockImplementation((...lines: unknown[]) => {
      stdout += `${lines.map(String).join(" ")}\n`;
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation((...lines: unknown[]) => {
      stderr += `${lines.map(String).join(" ")}\n`;
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation((...lines: unknown[]) => {
      stderr += `${lines.map(String).join(" ")}\n`;
    });

    const cmd = createUpgradeCommand();
    let status: number | undefined;
    try {
      await cmd.parseAsync(args, { from: "user" });
    } catch (err: unknown) {
      if (!(err instanceof ProcessExitError)) {
        throw err;
      }
    } finally {
      status = exit.exit.mock.calls[0]?.[0];
      exit.exit.mockRestore();
      logSpy.mockRestore();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
    return { status, stdout, stderr };
  }

  it("configures the default export command instance", () => {
    expect(upgradeCommand.name()).toBe("upgrade");
    expect(upgradeCommand.aliases()).toContain("update");
  });

  describe("--all flag", () => {
    it("exits with 1 when no installations are found", async () => {
      findOnPathMock.mockReturnValue(null);
      findAllOnPathMock.mockReturnValue([]);

      const res = await runUpgrade(["--all"]);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Could not find any Flisk installations on PATH.");
    });

    it("exits with 0 when confirmation prompt is cancelled", async () => {
      const fakeBin = join(tmp, "flisk");
      writeFileSync(fakeBin, "ELF");
      findAllOnPathMock.mockReturnValue([fakeBin]);
      findOnPathMock.mockReturnValue(null);
      execFileSyncMock.mockReturnValue("Mach-O 64-bit arm64");
      promptConfirmMock.mockResolvedValueOnce(false);

      const res = await runUpgrade(["--all"]);
      expect(res.status).toBe(0);
    });

    it("runs dry run successfully with --all --dry-run", async () => {
      const fakeBin = join(tmp, "flisk");
      writeFileSync(fakeBin, "ELF");
      findAllOnPathMock.mockReturnValue([fakeBin]);
      findOnPathMock.mockReturnValue(null);
      execFileSyncMock.mockReturnValue("Mach-O 64-bit arm64");

      const res = await runUpgrade(["--all", "--dry-run"]);
      expect(res.status).toBeUndefined();
      expect(res.stdout).toContain("Dry run: no installations were changed.");
    });
  });

  describe("unknown install method", () => {
    it("logs manual instructions and exits with 1", async () => {
      findOnPathMock.mockReturnValue(null);

      const res = await runUpgrade([]);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Could not detect installation method");
      expect(res.stdout).toContain("npm install -g @flisk-sh/flisk@latest");
    });
  });

  describe("Windows npm upgrade message", () => {
    it("prints message and returns without exiting when on Windows with npm install", async () => {
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });
      const npmPath = join(tmp, "node_modules", ".bin", "flisk");
      mkdirSync(dirname(npmPath), { recursive: true });
      writeFileSync(npmPath, "#!/bin/sh");
      findOnPathMock.mockReturnValue(npmPath);
      platformMock.isWindows.mockReturnValue(true);

      const res = await runUpgrade([]);
      expect(res.status).toBeUndefined();
      expect(res.stdout).toContain("use npm install -g @flisk-sh/flisk@latest");
    });
  });

  describe("binary upgrade flow", () => {
    let fakeBin: string;

    beforeEach(() => {
      fakeBin = join(tmp, "flisk");
      writeFileSync(fakeBin, "ELF");
      findOnPathMock.mockReturnValue(fakeBin);
      Object.defineProperty(process, "execPath", { value: fakeBin, configurable: true });
      execFileSyncMock.mockReturnValue("ELF 64-bit executable");
    });

    it("exits with 0 when already on the latest version and --force is not passed", async () => {
      getPackageVersionMock.mockReturnValue("1.3.186");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ tag_name: "v1.3.186" }),
        }),
      );

      const res = await runUpgrade([]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("You are already on the latest version!");
    });

    it("shows force upgrade requested when already on latest and --force is passed with --dry-run", async () => {
      getPackageVersionMock.mockReturnValue("1.3.186");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ tag_name: "v1.3.186" }),
        }),
      );

      const res = await runUpgrade(["--force", "--dry-run"]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Force upgrade requested (currently 1.3.186)");
      expect(res.stdout).toContain("Dry run mode - would perform:");
      expect(res.stdout).toContain("Action: Download and replace with");
    });

    it("exits with 1 when binary release cannot be found", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
        }),
      );

      const res = await runUpgrade([]);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Unsupported OS");
    });

    it("exits with 1 with Windows ARM64 specific error when on win32 arm64 and binary release missing", async () => {
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });
      Object.defineProperty(process, "arch", { value: "arm64", configurable: true });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
        }),
      );

      const res = await runUpgrade([]);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Flisk Windows v1 supports AMD64 only");
    });

    it("exits with 1 with Windows AMD64 specific error when on win32 x64 and binary release missing", async () => {
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });
      Object.defineProperty(process, "arch", { value: "x64", configurable: true });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
        }),
      );

      const res = await runUpgrade([]);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("No Windows AMD64 binary in this Flisk release");
    });

    it("exits with 1 and shows manual curl instructions when binary upgrade fails", async () => {
      getPackageVersionMock.mockReturnValue("1.3.0");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
          if (url.includes("/releases/latest")) {
            return {
              ok: true,
              json: async () => ({ tag_name: "v1.4.0" }),
            };
          }
          return { ok: false, status: 500 };
        }),
      );

      const res = await runUpgrade(["--yes"]);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Upgrade failed");
      expect(res.stdout).toContain("curl -fsSL -o");
    });

    it("shows Windows PowerShell instructions when binary upgrade fails on Windows", async () => {
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });
      platformMock.isWindows.mockReturnValue(true);
      getPackageVersionMock.mockReturnValue("1.3.0");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
          if (url.includes("/releases/latest")) {
            return {
              ok: true,
              json: async () => ({ tag_name: "v1.4.0" }),
            };
          }
          return { ok: false, status: 500 };
        }),
      );

      const res = await runUpgrade(["--yes"]);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Upgrade failed");
      expect(res.stdout).toContain("irm https://flisk.sh/install.ps1 | iex");
    });
  });

  describe("git upgrade flow", () => {
    let gitDir: string;
    let fakeBin: string;

    beforeEach(() => {
      gitDir = join(tmp, "my-repo");
      const binDir = join(gitDir, "tdk-cli", "bin");
      mkdirSync(join(gitDir, ".git"), { recursive: true });
      mkdirSync(binDir, { recursive: true });
      fakeBin = join(binDir, "flisk");
      writeFileSync(fakeBin, "#!/bin/sh");
      findOnPathMock.mockReturnValue(fakeBin);
    });

    it("exits with 0 when local commit matches remote and --force is not passed", async () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (args[0] === "fetch") return "";
        if (args[0] === "rev-parse" && args[1] === "HEAD") return "abcdef1234567\n";
        if (args[0] === "rev-parse" && args[1] === "origin/main") return "abcdef1234567\n";
        return "";
      });

      const res = await runUpgrade([]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Already up to date with origin/main!");
    });

    it("shows updates available and performs dry run", async () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (args[0] === "fetch") return "";
        if (args[0] === "rev-parse" && args[1] === "HEAD") return "aaaaaaa111111\n";
        if (args[0] === "rev-parse" && args[1] === "origin/main") return "bbbbbbb222222\n";
        return "";
      });

      const res = await runUpgrade(["--dry-run"]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Updates available:");
      expect(res.stdout).toContain("Action: fetch origin, update from origin/HEAD");
    });

    it("warns and continues when git remote check fails", async () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (args[0] === "fetch") throw new Error("remote offline");
        return "";
      });

      const res = await runUpgrade(["--dry-run"]);
      expect(res.status).toBe(0);
      expect(res.stderr).toContain("Could not check git remote, will attempt upgrade anyway");
      expect(res.stdout).toContain("Action: fetch origin, update from origin/HEAD");
    });

    it("exits with 1 and shows git status instructions when git upgrade fails", async () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (args[0] === "fetch") return "";
        if (args[0] === "rev-parse" && args[1] === "HEAD") return "aaaaaaa111111\n";
        if (args[0] === "rev-parse" && args[1] === "origin/main") return "bbbbbbb222222\n";
        if (args[0] === "status" && args[1] === "--porcelain") return " M cli/src/foo.ts";
        return "";
      });

      const res = await runUpgrade(["--yes"]);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Upgrade failed");
      expect(res.stdout).toContain("Check local changes with: git -C");
    });

    it("successfully upgrades git install and displays git clone details in verification", async () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (args?.[0] === "fetch") return "";
        if (args?.[0] === "rev-parse" && args[1] === "HEAD") return "aaaaaaa111111\n";
        if (args?.[0] === "rev-parse" && args[1] === "origin/main") return "bbbbbbb222222\n";
        if (args?.[0] === "rev-parse" && args[1] === "--git-dir") return ".git";
        if (args?.[0] === "status" && args[1] === "--porcelain") return "";
        if (args?.[0] === "rev-parse" && args[1] === "--abbrev-ref") return "main\n";
        if (args?.[0] === "symbolic-ref") return "origin/main\n";
        if (args?.[0] === "pull") return "";
        if (args?.[0] === "install" || args?.[0] === "run" || args?.[0] === "link") return "";
        if (args?.[0] === "version") return "1.4.0\n";
        return "";
      });

      const res = await runUpgrade(["--yes"]);
      expect(res.status).toBeUndefined();
      expect(res.stdout).toContain("Method:   git clone + bun link");
      expect(res.stdout).toContain("Upgrade complete!");
    });

    it("displays git-specific verify hint when verification fails after git upgrade", async () => {
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (args?.[0] === "fetch") return "";
        if (args?.[0] === "rev-parse" && args[1] === "HEAD") return "aaaaaaa111111\n";
        if (args?.[0] === "rev-parse" && args[1] === "origin/main") return "bbbbbbb222222\n";
        if (args?.[0] === "rev-parse" && args[1] === "--git-dir") return ".git";
        if (args?.[0] === "status" && args[1] === "--porcelain") return "";
        if (args?.[0] === "rev-parse" && args[1] === "--abbrev-ref") return "main\n";
        if (args?.[0] === "symbolic-ref") return "origin/main\n";
        if (args?.[0] === "pull") return "";
        if (args?.[0] === "install" || args?.[0] === "run" || args?.[0] === "link") return "";
        if (args?.[0] === "version") throw new Error("corrupt executable");
        return "";
      });

      const res = await runUpgrade(["--yes"]);
      expect(res.status).toBeUndefined();
      expect(res.stderr).toContain("Verification error");
      expect(res.stdout).toContain("Compare with: git -C");
    });
  });

  describe("package manager (npm/bun) flow", () => {
    let npmBin: string;

    beforeEach(() => {
      npmBin = join(tmp, "node_modules", ".bin", "flisk");
      mkdirSync(dirname(npmBin), { recursive: true });
      writeFileSync(npmBin, "#!/bin/sh");
      findOnPathMock.mockReturnValue(npmBin);
    });

    it("exits with 1 when getLatestVersion returns null", async () => {
      execSyncMock.mockImplementation(() => {
        throw new Error("npm failure");
      });

      const res = await runUpgrade([]);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Could not determine latest version");
    });

    it("exits with 0 when already on the latest version and --force is not passed", async () => {
      getPackageVersionMock.mockReturnValue("1.4.0");
      execSyncMock.mockReturnValue("1.4.0\n");

      const res = await runUpgrade([]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("You are already on the latest version!");
    });

    it("exits with 0 when user declines confirmation prompt", async () => {
      getPackageVersionMock.mockReturnValue("1.3.0");
      execSyncMock.mockReturnValue("1.4.0\n");
      promptConfirmMock.mockResolvedValueOnce(false);

      const res = await runUpgrade([]);
      expect(res.status).toBe(0);
    });

    it("successfully upgrades and verifies new version", async () => {
      getPackageVersionMock.mockReturnValue("1.3.0");
      execSyncMock.mockReturnValue("1.4.0\n");
      execFileSyncMock.mockReturnValue("1.4.0\n");

      const res = await runUpgrade(["--yes"]);
      expect(res.status).toBeUndefined();
      expect(res.stdout).toContain("Upgrade complete!");
      expect(res.stdout).toContain("Version: 1.3.0 → 1.4.0");
      expect(res.stdout).toContain("flisk --help");
    });

    it("shows restart warning when version appears unchanged after upgrade without --force", async () => {
      getPackageVersionMock.mockReturnValue("1.3.0");
      execSyncMock.mockReturnValue("1.4.0\n");
      execFileSyncMock.mockReturnValue("1.3.0\n");

      const res = await runUpgrade(["--yes"]);
      expect(res.status).toBeUndefined();
      expect(res.stdout).toContain(
        "Tip: Version appears unchanged. You may need to restart your terminal.",
      );
    });

    it("handles verification failure with permission error", async () => {
      getPackageVersionMock.mockReturnValue("1.3.0");
      execSyncMock.mockReturnValue("1.4.0\n");
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (args?.[0] === "version") {
          const err = new Error("Permission denied");
          Object.assign(err, { code: "EACCES" });
          throw err;
        }
        return "";
      });

      const res = await runUpgrade(["--yes"]);
      expect(res.status).toBeUndefined();
      expect(res.stderr).toContain("Verification error");
      expect(res.stdout).toContain("chmod +x");
    });

    it("handles verification failure with generic error", async () => {
      getPackageVersionMock.mockReturnValue("1.3.0");
      execSyncMock.mockReturnValue("1.4.0\n");
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (args?.[0] === "version") {
          throw new Error("spawn error");
        }
        return "";
      });

      const res = await runUpgrade(["--yes"]);
      expect(res.status).toBeUndefined();
      expect(res.stderr).toContain("Verification error");
      expect(res.stdout).toContain("Verify manually:");
    });

    it("successfully upgrades bun installation", async () => {
      const bunPath = join(tmp, ".bun", "bin", "flisk");
      mkdirSync(dirname(bunPath), { recursive: true });
      writeFileSync(bunPath, "#!/bin/sh");
      findOnPathMock.mockReturnValue(bunPath);
      getPackageVersionMock.mockReturnValue("1.3.0");
      execSyncMock.mockReturnValue("1.4.0\n");
      execFileSyncMock.mockReturnValue("1.4.0\n");

      const res = await runUpgrade(["--yes"]);
      expect(res.status).toBeUndefined();
      expect(res.stdout).toContain("Upgrade complete!");
    });
  });
});
