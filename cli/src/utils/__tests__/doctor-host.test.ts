// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  checkDiskSpace,
  DISK_SPACE_CHECK,
  DOCKER_DESKTOP_STUCK_FIX,
  dockerDesktopStuck,
} from "../doctor-host.js";

const GIB = 1024 ** 3;
const statfsWith = (freeGib: number) => () => ({
  bavail: Math.round((freeGib * GIB) / 4096),
  bsize: 4096,
});

describe("checkDiskSpace", () => {
  it("fails below 2 GB with cleanup commands", () => {
    const result = checkDiskSpace(statfsWith(1.9));
    expect(result).toMatchObject({ name: DISK_SPACE_CHECK, didPass: false });
    expect(result.isWarning).toBeUndefined();
    expect(result.message).toMatch(/1\.9 GB free/);
    expect(result.fix).toMatch(/docker system prune -af/);
  });

  it("handles boundary at exactly 2 GB as a warning rather than a failure", () => {
    const result = checkDiskSpace(statfsWith(2.0));
    expect(result).toMatchObject({
      name: DISK_SPACE_CHECK,
      didPass: false,
      isWarning: true,
      message: "2.0 GB free: image builds may fail",
    });
  });

  it("warns between 2 and 10 GB", () => {
    const result = checkDiskSpace(statfsWith(6));
    expect(result).toMatchObject({ didPass: false, isWarning: true });
  });

  it("handles boundary at exactly 10 GB as passing", () => {
    const result = checkDiskSpace(statfsWith(10.0));
    expect(result).toMatchObject({
      name: DISK_SPACE_CHECK,
      didPass: true,
      message: "10.0 GB free",
    });
    expect(result.isWarning).toBeUndefined();
  });

  it("fails at 0 GB free space", () => {
    const result = checkDiskSpace(statfsWith(0));
    expect(result).toMatchObject({
      name: DISK_SPACE_CHECK,
      didPass: false,
      message: "0.0 GB free: Docker cannot build or start containers",
    });
  });

  it("passes with plenty of space", () => {
    expect(checkDiskSpace(statfsWith(40))).toMatchObject({
      didPass: true,
      message: "40.0 GB free",
    });
  });

  it("queries the specified path", () => {
    let queriedPath = "";
    const customStatfs = (targetPath: string) => {
      queriedPath = targetPath;
      return { bavail: 10000000, bsize: 4096 };
    };
    checkDiskSpace(customStatfs, "/custom/mount/path");
    expect(queriedPath).toBe("/custom/mount/path");
  });

  it("runs with default statfs and homedir arguments without throwing", () => {
    const result = checkDiskSpace();
    expect(result.name).toBe(DISK_SPACE_CHECK);
    expect(typeof result.didPass).toBe("boolean");
    expect(typeof result.message).toBe("string");
  });

  it("accepts bigint stats and skips when the disk cannot be read", () => {
    expect(
      checkDiskSpace(() => ({ bavail: BigInt(50 * 262144), bsize: BigInt(4096) })).didPass,
    ).toBe(true);
    const skipped = checkDiskSpace(() => {
      throw new Error("EACCES");
    });
    expect(skipped).toMatchObject({ didPass: true, isSkipped: true });
  });
});

describe("dockerDesktopStuck", () => {
  it("reports a stuck engine when Docker Desktop is open on macOS", () => {
    const result = dockerDesktopStuck(true, "darwin");
    expect(result).toMatchObject({
      didPass: false,
      message: "Docker Desktop is open, but its engine is not responding",
      fix: DOCKER_DESKTOP_STUCK_FIX,
    });
  });

  it("returns null when Docker Desktop is not running or on other platforms", () => {
    expect(dockerDesktopStuck(false, "darwin")).toBeNull();
    expect(dockerDesktopStuck(true, "linux")).toBeNull();
    expect(dockerDesktopStuck(true, "win32")).toBeNull();
    expect(dockerDesktopStuck(false, "win32")).toBeNull();
  });

  it("defaults to process.platform when platform argument is omitted", () => {
    const result = dockerDesktopStuck(false);
    expect(result).toBeNull();
  });
});
