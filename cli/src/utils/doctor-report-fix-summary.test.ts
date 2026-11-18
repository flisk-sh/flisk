// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CheckResult, DoctorAction } from "../types/index.js";
import { printFixActions } from "./doctor-render.js";
import { summarizeDoctorFix } from "./doctor-report.js";

const failed = (name: string): CheckResult => ({
  name,
  message: "failed",
  didPass: false,
  isSkipped: false,
});
const action = (check: string, status: DoctorAction["status"]): DoctorAction => ({
  id: check,
  check,
  scope: "project",
  command: "true",
  status,
  reason: "r",
});

describe("summarizeDoctorFix", () => {
  it("does not count a failure covered by a planned repair as manual work", () => {
    const summary = summarizeDoctorFix(
      [failed("Docker networks"), failed("Node version")],
      [action("Docker networks", "planned")],
    );
    expect(summary).toEqual({ repairableCount: 1, needsActionCount: 1 });
  });

  it("keeps a failure whose repair failed or was skipped as manual work", () => {
    const summary = summarizeDoctorFix(
      [failed("Docker networks")],
      [action("Docker networks", "failed")],
    );
    expect(summary).toEqual({ repairableCount: 0, needsActionCount: 1 });
  });

  it("keeps a failure that remains after an applied repair as manual work", () => {
    const summary = summarizeDoctorFix([failed("Disk Space")], [action("Disk Space", "applied")]);
    expect(summary).toEqual({ repairableCount: 1, needsActionCount: 1 });
  });
});

describe("printFixActions with no actions", () => {
  afterEach(() => vi.restoreAllMocks());

  const capture = (failedCheckCount: number): string => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    printFixActions([], false, failedCheckCount);
    return log.mock.calls.map((c) => c.join(" ")).join("\n");
  };

  it("says manual action is needed, without a success mark, when a check failed", () => {
    const out = capture(2);
    expect(out).toContain("Nothing to repair automatically; 2 checks need your action");
    expect(out).not.toContain("✓");
  });

  it("prints a success-marked message for a clean run", () => {
    expect(capture(0)).toContain("✓ Nothing to repair");
  });
});
