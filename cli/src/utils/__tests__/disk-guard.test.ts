// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  DISK_SAFE_CLEANUP,
  diskWarningField,
  enforceDiskGuard,
  evaluateDisk,
  readDockerVmFreeGib,
} from "../disk-guard.js";

const GIB = 1024 ** 3;
const hostFree = (gib: number) => () => ({ bavail: Math.round((gib * GIB) / 4096), bsize: 4096 });

describe("evaluateDisk: hard threshold (cycle 1)", () => {
  it("fails below 5 GiB and names the free space, the need and the cleanup command", () => {
    const result = evaluateDisk({ statfs: hostFree(3), env: {} });
    expect(result.level).toBe("fail");
    expect(result.message).toMatch(/3\.0 GiB free/);
    expect(result.message).toMatch(/needs at least 5 GiB/);
    expect(result.fix).toContain(DISK_SAFE_CLEANUP);
  });

  it("passes at exactly 5 GiB to 15 GiB as a warning, not a failure", () => {
    expect(evaluateDisk({ statfs: hostFree(5), env: {} }).level).toBe("warn");
  });

  it("can be overridden with FLISK_DISK_MIN_GIB", () => {
    expect(evaluateDisk({ statfs: hostFree(3), env: { FLISK_DISK_MIN_GIB: "2" } }).level).toBe(
      "warn",
    );
    expect(evaluateDisk({ statfs: hostFree(8), env: { FLISK_DISK_MIN_GIB: "9" } }).level).toBe(
      "fail",
    );
  });
});

describe("evaluateDisk: warning band (cycle 2)", () => {
  it("warns between 5 and 15 GiB with the same cleanup command", () => {
    const result = evaluateDisk({ statfs: hostFree(10), env: {} });
    expect(result.level).toBe("warn");
    expect(result.message).toMatch(/10\.0 GiB free/);
    expect(result.fix).toContain(DISK_SAFE_CLEANUP);
  });

  it("is ok at 15 GiB and above", () => {
    const result = evaluateDisk({ statfs: hostFree(15), env: {} });
    expect(result.level).toBe("ok");
    expect(result.fix).toBeUndefined();
  });

  it("can be overridden with FLISK_DISK_WARN_GIB, and an invalid value falls back to the default", () => {
    expect(evaluateDisk({ statfs: hostFree(10), env: { FLISK_DISK_WARN_GIB: "8" } }).level).toBe(
      "ok",
    );
    expect(evaluateDisk({ statfs: hostFree(10), env: { FLISK_DISK_WARN_GIB: "abc" } }).level).toBe(
      "warn",
    );
  });

  it("is unknown when the disk cannot be read", () => {
    const result = evaluateDisk({
      statfs: () => {
        throw new Error("nope");
      },
      env: {},
    });
    expect(result.level).toBe("unknown");
  });
});

describe("evaluateDisk: Docker VM disk (cycle 3)", () => {
  it("catches a full VM when the host looks fine, taking the smaller number", () => {
    const result = evaluateDisk({ statfs: hostFree(200), vmFreeGib: 2, env: {} });
    expect(result.level).toBe("fail");
    expect(result.source).toBe("docker-vm");
    expect(result.message).toMatch(/2\.0 GiB free on the Docker VM disk/);
  });

  it("uses the host number when it is the smaller one", () => {
    const result = evaluateDisk({ statfs: hostFree(3), vmFreeGib: 80, env: {} });
    expect(result.source).toBe("host");
    expect(result.level).toBe("fail");
  });

  it("falls back to the VM number when the host cannot be read", () => {
    const result = evaluateDisk({
      statfs: () => {
        throw new Error("x");
      },
      vmFreeGib: 40,
      env: {},
    });
    expect(result.level).toBe("ok");
    expect(result.source).toBe("docker-vm");
  });
});

describe("readDockerVmFreeGib (cycle 3)", () => {
  const dfLine = (kib: number) =>
    `Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/vda1 100000000 1 ${kib} 1% /var/lib/docker\n`;

  it("reads the data root from the daemon and the free space from the VM", () => {
    const calls: string[] = [];
    const free = readDockerVmFreeGib({
      run: (cmd, args) => {
        calls.push(`${cmd} ${args.join(" ")}`);
        if (cmd === "docker") return "/var/lib/docker\n";
        return dfLine(3 * 1024 * 1024);
      },
      statfs: () => {
        throw new Error("not on this host");
      },
    });
    expect(free).toBeCloseTo(3, 5);
    expect(calls[0]).toContain("docker info");
    expect(calls[1]).toContain("colima ssh -- df -Pk /var/lib/docker");
  });

  it("reads the data root directly when the daemon runs on this host", () => {
    const free = readDockerVmFreeGib({
      run: () => "/var/lib/docker\n",
      statfs: hostFree(7),
    });
    expect(free).toBeCloseTo(7, 1);
  });

  it("returns null when Docker or the VM cannot be asked", () => {
    expect(
      readDockerVmFreeGib({
        run: () => null,
        statfs: hostFree(1),
      }),
    ).toBeNull();
    expect(
      readDockerVmFreeGib({
        run: (cmd) => (cmd === "docker" ? "/var/lib/docker\n" : null),
        statfs: () => {
          throw new Error("x");
        },
      }),
    ).toBeNull();
  });
});

describe("enforceDiskGuard (cycles 1 and 2)", () => {
  const harness = () => {
    const emitted: Array<{ data: Record<string, unknown>; errors?: unknown[] }> = [];
    const shown: string[] = [];
    const warned: string[] = [];
    return {
      emitted,
      shown,
      warned,
      deps: {
        emit: (data: Record<string, unknown>, errors?: unknown[]) => emitted.push({ data, errors }),
        showError: (message: string, suggestions: string[]) => {
          shown.push(`${message}\n${suggestions.join("\n")}`);
        },
        warn: (line: string) => warned.push(line),
        exit: (code: number): never => {
          throw new Error(`exit ${code}`);
        },
        env: {},
      },
    };
  };

  it("exits 1 with the cleanup command before anything is built when space is under the hard threshold", () => {
    const h = harness();
    expect(() => enforceDiskGuard({ ...h.deps, statfs: hostFree(1) })).toThrow("exit 1");
    expect(h.shown[0]).toMatch(/1\.0 GiB free/);
    expect(h.shown[0]).toContain(DISK_SAFE_CLEANUP);
    expect(h.emitted[0].data).toMatchObject({ ok: false });
    expect(h.emitted[0].errors).toMatchObject([{ code: "DISK_SPACE_LOW" }]);
  });

  it("warns and continues between 5 and 15 GiB, and returns the warning for the JSON result", () => {
    const h = harness();
    const result = enforceDiskGuard({ ...h.deps, statfs: hostFree(9) });
    expect(result?.level).toBe("warn");
    expect(h.warned.join("\n")).toContain(DISK_SAFE_CLEANUP);
    expect(h.emitted).toEqual([]);
    expect(diskWarningField(result)).toMatchObject({
      level: "warn",
      freeGib: 9,
      failBelowGib: 5,
      warnBelowGib: 15,
      fix: expect.stringContaining(DISK_SAFE_CLEANUP),
    });
  });

  it("stays silent when there is plenty of space", () => {
    const h = harness();
    const result = enforceDiskGuard({ ...h.deps, statfs: hostFree(100) });
    expect(h.warned).toEqual([]);
    expect(diskWarningField(result)).toBeUndefined();
  });

  it("stays silent when the disk cannot be read", () => {
    const h = harness();
    enforceDiskGuard({
      ...h.deps,
      statfs: () => {
        throw new Error("x");
      },
    });
    expect(h.warned).toEqual([]);
    expect(h.shown).toEqual([]);
  });
});
