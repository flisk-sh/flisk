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

  it("warns between 2 and 10 GB", () => {
    const result = checkDiskSpace(statfsWith(6));
    expect(result).toMatchObject({ didPass: false, isWarning: true });
  });

  it("passes with plenty of space", () => {
    expect(checkDiskSpace(statfsWith(40))).toMatchObject({
      didPass: true,
      message: "40.0 GB free",
    });
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
  });
});
