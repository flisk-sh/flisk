// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import type { CheckResult, DoctorAction } from "../types/index.js";
import { summarizeDoctorFix } from "./doctor-report.js";

const failed = (name: string): CheckResult => ({ name, message: "failed", didPass: false, isSkipped: false });
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
});
