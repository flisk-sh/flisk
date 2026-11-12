// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import type { CheckResult } from "../../types/index.js";
import { CONTAINER_RUNTIME_CHECK } from "../constants.js";
import { formatFixFirst, rankDoctorFixes } from "../doctor-fix-first.js";
import { createDoctorReport } from "../doctor-report.js";

const fail = (name: string, extra: Partial<CheckResult> = {}): CheckResult => ({
  name,
  didPass: false,
  message: `${name} failed`,
  ...extra,
});
const diskWarning = fail("Disk Space", { isWarning: true });
const ports = fail("Host Ports", {
  message: "Ports Flisk needs are taken:\n    5432 (Postgres) is used by a program",
});
const runtime = fail(CONTAINER_RUNTIME_CHECK);

describe("rankDoctorFixes", () => {
  it("puts a stopped Docker daemon before port conflicts before disk-space warnings", () => {
    const fixes = rankDoctorFixes([diskWarning, ports, runtime], "darwin");
    expect(fixes.map((fix) => [fix.rank, fix.checkId])).toEqual([
      [1, "container-runtime"],
      [2, "host-ports"],
      [3, "disk-space"],
    ]);
    expect(fixes[0]?.command).toBe("open -a Docker");
    expect(fixes[1]?.command).toBe("lsof -nP -iTCP:5432 -sTCP:LISTEN");
  });

  it("ranks a hard disk failure above a project-level failure but below the daemon", () => {
    const fixes = rankDoctorFixes([fail("Master Configs"), fail("Disk Space"), runtime], "linux");
    expect(fixes.map((fix) => fix.checkId)).toEqual([
      "container-runtime",
      "disk-space",
      "master-configs",
    ]);
  });

  it("uses a command valid for the platform", () => {
    expect(rankDoctorFixes([runtime], "linux")[0]?.command).toBe("sudo systemctl start docker");
    expect(rankDoctorFixes([ports], "linux")[0]?.command).toBe("ss -ltnp 'sport = :5432'");
    expect(rankDoctorFixes([runtime], "win32")).toEqual([]);
  });

  it("points Windows port conflicts at netstat", () => {
    expect(rankDoctorFixes([ports], "win32")[0]?.command).toBe('netstat -ano | findstr /c:":5432 "');
  });

  it("skips passing, skipped and command-less checks", () => {
    const fixes = rankDoctorFixes(
      [
        { name: "Bun", didPass: true, message: "ok" },
        fail("Tilt CLI", { isSkipped: true }),
        fail("Resource Discovery"),
      ],
      "darwin",
    );
    expect(fixes).toEqual([]);
  });

  it("prints one command per line", () => {
    const lines = formatFixFirst(rankDoctorFixes([diskWarning, runtime], "darwin"));
    expect(lines).toEqual([
      "  1. Container Runtime",
      "     open -a Docker",
      "  2. Disk Space",
      "     docker system prune -af",
    ]);
  });
});

describe("doctor report fixFirst", () => {
  it("adds ranked fixes to the JSON data only when there are some", () => {
    expect(
      createDoctorReport([{ name: "Bun", didPass: true, message: "ok" }], true).data,
    ).not.toHaveProperty("fixFirst");
    const report = createDoctorReport([diskWarning, runtime], true);
    const expected = process.platform === "win32" ? undefined : ["container-runtime", "disk-space"];
    expect(report.data.fixFirst?.map((fix) => fix.checkId)).toEqual(expected);
  });
});
