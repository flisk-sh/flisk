import { expect, it } from "vitest";
import { collectDoctorChecks, createDoctorReport } from "../../utils/doctor-report.js";

it("includes elapsed milliseconds for both machine and project checks in the JSON result", async () => {
  const result = await collectDoctorChecks(
    [() => ({ name: "machine", message: "ok", didPass: true })],
    [() => ({ name: "project", message: "ok", didPass: true })],
  );
  const {
    data: { checks },
  } = createDoctorReport(result.checks, true);
  expect(checks).toHaveLength(2);
  for (const check of checks) {
    expect(Number.isInteger(check.durationMs)).toBe(true);
    expect(check.durationMs).toBeGreaterThanOrEqual(0);
  }
});
