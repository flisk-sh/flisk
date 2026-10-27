// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";

import { type ColimaDeps, checkColima, isColimaDocker, nativeLimaPath } from "../colima.js";

const { existsSyncMock, execFileSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  execFileSyncMock: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: (path: string) => existsSyncMock(path),
  };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFileSync: (command: string, args: string[], options?: unknown) =>
      execFileSyncMock(command, args, options),
  };
});

function deps(overrides: Partial<ColimaDeps> = {}): ColimaDeps {
  return {
    env: { DOCKER_HOST: "unix:///Users/me/.colima/default/docker.sock" },
    run: () => "colima is running using macOS Virtualization.Framework\narch: aarch64\n",
    exists: () => true,
    home: "/Users/me",
    dockerAnswers: () => true,
    ...overrides,
  };
}

describe("isColimaDocker", () => {
  it("is true when the Docker endpoint is a Colima socket", () => {
    expect(isColimaDocker(deps())).toBe(true);
  });

  it("is false for a plain Docker endpoint", () => {
    expect(
      isColimaDocker(
        deps({ env: { DOCKER_HOST: "unix:///var/run/docker.sock" }, exists: () => false }),
      ),
    ).toBe(false);
  });
});

describe("checkColima", () => {
  it("reports a running VM with its architecture", () => {
    const status = checkColima(deps());
    expect(status.isColima).toBe(true);
    expect(status.running).toBe(true);
    expect(status.arch).toBe("aarch64");
    expect(status.problem).toBeUndefined();
  });

  it("says nothing when Docker does not run on Colima", () => {
    const status = checkColima(
      deps({ env: { DOCKER_HOST: "unix:///var/run/docker.sock" }, exists: () => false }),
    );
    expect(status.isColima).toBe(false);
    expect(status.running).toBe(true);
  });

  it("reports a VM that is not running", () => {
    const status = checkColima(
      deps({
        dockerAnswers: () => false,
        run: () => {
          const error = new Error("colima not running") as Error & { stderr?: string };
          error.stderr = "time=... level=fatal msg=colima not running";
          throw error;
        },
      }),
    );
    expect(status.running).toBe(false);
    expect(status.problem).toContain("not running");
    expect(status.fix).toContain("colima start");
  });

  it("reports a Lima that cannot run on this architecture", () => {
    const status = checkColima(
      deps({
        dockerAnswers: () => false,
        run: () => {
          const error = new Error("lima compatibility error") as Error & { stderr?: string };
          error.stderr =
            "level=fatal msg=limactl is running under rosetta, please reinstall lima with native arch";
          throw error;
        },
      }),
    );
    expect(status.running).toBe(false);
    expect(status.problem).toContain("x86_64");
    expect(status.fix).toContain("native");
  });
});

describe("checkColima with a broken colima CLI", () => {
  it("says the VM is running when Docker answers but colima cannot see it", () => {
    const status = checkColima(
      deps({
        dockerAnswers: () => true,
        run: () => {
          const error = new Error("colima not running") as Error & { stderr?: string };
          error.stderr = "time=... level=fatal msg=colima not running";
          throw error;
        },
      }),
    );
    expect(status.running).toBe(true);
    expect(status.problem).toContain("cannot see it");
    expect(status.fix).toContain("native limactl");
  });

  it("says the VM is down when Docker does not answer either", () => {
    const status = checkColima(
      deps({
        dockerAnswers: () => false,
        run: () => {
          const error = new Error("colima not running") as Error & { stderr?: string };
          error.stderr = "time=... level=fatal msg=colima not running";
          throw error;
        },
      }),
    );
    expect(status.running).toBe(false);
    expect(status.fix).toContain("colima start");
  });
});

describe("checkColima with colima logging to stderr", () => {
  it("reads the status from stderr, the way colima logs it", () => {
    // colima prints its status as logrus lines on stderr; a check that only reads stdout
    // would call a healthy VM "not running".
    const status = checkColima(
      deps({
        run: () =>
          "time=... level=info msg=colima is running using macOS Virtualization.Framework\narch: aarch64\n",
      }),
    );
    expect(status.running).toBe(true);
    expect(status.arch).toBe("aarch64");
    expect(status.problem).toBeUndefined();
  });
});

describe("nativeLimaPath", () => {
  const fakeHome = "/Users/fakeuser";

  beforeEach(() => {
    existsSyncMock.mockReset();
    execFileSyncMock.mockReset();
    existsSyncMock.mockReturnValue(false);
  });

  it("returns undefined when no Lima binary exists in candidate directories", () => {
    existsSyncMock.mockReturnValue(false);
    expect(nativeLimaPath({ HOME: fakeHome })).toBeUndefined();
  });

  it("returns /opt/homebrew/bin when a native arm64 limactl is present there", () => {
    existsSyncMock.mockImplementation((path: string) => path === "/opt/homebrew/bin/limactl");
    execFileSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "file" && args?.[1] === "/opt/homebrew/bin/limactl") {
        return "Mach-O 64-bit executable arm64\n";
      }
      return "";
    });

    expect(nativeLimaPath({ HOME: fakeHome })).toBe("/opt/homebrew/bin");
  });

  it("returns ~/.local/bin when limactl is in ~/.local/bin and is a native aarch64 binary", () => {
    const expectedBin = `${fakeHome}/.local/bin`;
    existsSyncMock.mockImplementation((path: string) => path === `${expectedBin}/limactl`);
    execFileSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "file" && args?.[1] === `${expectedBin}/limactl`) {
        return "ELF 64-bit LSB executable, ARM aarch64\n";
      }
      return "";
    });

    expect(nativeLimaPath({ HOME: fakeHome })).toBe(expectedBin);
  });

  it("returns ~/bin when limactl is in ~/bin and is a native arm64 binary", () => {
    const expectedBin = `${fakeHome}/bin`;
    existsSyncMock.mockImplementation((path: string) => path === `${expectedBin}/limactl`);
    execFileSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "file" && args?.[1] === `${expectedBin}/limactl`) {
        return "Mach-O 64-bit executable arm64\n";
      }
      return "";
    });

    expect(nativeLimaPath({ HOME: fakeHome })).toBe(expectedBin);
  });

  it("skips an x86_64 binary and returns undefined if no native candidate exists", () => {
    existsSyncMock.mockImplementation((path: string) => path === "/opt/homebrew/bin/limactl");
    execFileSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "file" && args?.[1] === "/opt/homebrew/bin/limactl") {
        return "Mach-O 64-bit executable x86_64\n";
      }
      return "";
    });

    expect(nativeLimaPath({ HOME: fakeHome })).toBeUndefined();
  });

  it("skips an x86_64 binary in /opt/homebrew/bin and selects native arm64 in ~/.local/bin (candidate precedence)", () => {
    const localBin = `${fakeHome}/.local/bin`;
    existsSyncMock.mockImplementation(
      (path: string) => path === "/opt/homebrew/bin/limactl" || path === `${localBin}/limactl`,
    );
    execFileSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "file" && args?.[1] === "/opt/homebrew/bin/limactl") {
        return "Mach-O 64-bit executable x86_64\n";
      }
      if (cmd === "file" && args?.[1] === `${localBin}/limactl`) {
        return "Mach-O 64-bit executable arm64\n";
      }
      return "";
    });

    expect(nativeLimaPath({ HOME: fakeHome })).toBe(localBin);
  });

  it("prefers /opt/homebrew/bin over ~/.local/bin when both are native (candidate precedence)", () => {
    const localBin = `${fakeHome}/.local/bin`;
    existsSyncMock.mockImplementation(
      (path: string) => path === "/opt/homebrew/bin/limactl" || path === `${localBin}/limactl`,
    );
    execFileSyncMock.mockImplementation((cmd: string) => {
      if (cmd === "file") return "Mach-O 64-bit executable arm64\n";
      return "";
    });

    expect(nativeLimaPath({ HOME: fakeHome })).toBe("/opt/homebrew/bin");
  });

  it("falls back to accepting candidate directory if the file command fails or is unavailable", () => {
    existsSyncMock.mockImplementation((path: string) => path === "/opt/homebrew/bin/limactl");
    execFileSyncMock.mockImplementation(() => {
      throw new Error("spawn file ENOENT");
    });

    expect(nativeLimaPath({ HOME: fakeHome })).toBe("/opt/homebrew/bin");
  });

  it("returns undefined when HOME is undefined and /opt/homebrew/bin does not exist", () => {
    existsSyncMock.mockReturnValue(false);
    expect(nativeLimaPath({ HOME: undefined })).toBeUndefined();
  });
});
