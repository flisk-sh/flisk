// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { createDoctorReport } from "../doctor-report.js";
import { createHostPortPlan } from "../host-port-plan.js";
import { formatPortFallbackNotice } from "../port-fallback-notice.js";

const free = async () => true;
// Ports 80 and 443 are tried first; mark them busy to exercise the fallback range.
const privilegedBusy = async (port: number) => port !== 80 && port !== 443;

describe("formatPortFallbackNotice", () => {
  it("names the requested port, the chosen port and the env var that forces it", async () => {
    const plan = await createHostPortPlan({
      env: {},
      isAvailable: async (port) => (await privilegedBusy(port)) && port !== 8080,
    });
    const http = formatPortFallbackNotice(plan).find((line) => line.startsWith("HTTP:"));
    expect(http).toBe(
      "HTTP: wanted 80, using 8081 (selected from fallback range 8080-8180). To force 80: TDK_HTTP_PORT=80 tdk up",
    );
  });

  it("reports the same chosen port that doctor --json reports", async () => {
    const plan = await createHostPortPlan({
      env: {},
      isAvailable: async (port) => (await privilegedBusy(port)) && port !== 8080,
    });
    const doctor = createDoctorReport([], true, [], plan);
    expect(doctor.data.ports?.http.chosen).toBe(8081);
    expect(formatPortFallbackNotice(plan).join("\n")).toContain("using 8081");
  });

  it("lists every port that moved", async () => {
    const plan = await createHostPortPlan({ env: {}, isAvailable: privilegedBusy });
    expect(formatPortFallbackNotice(plan).map((line) => line.split(":")[0])).toEqual([
      "HTTP",
      "HTTPS",
      "Postgres",
    ]);
  });

  it("stays silent for ports the user set explicitly", async () => {
    const plan = await createHostPortPlan({
      env: { TDK_HTTP_PORT: "9000", TDK_HTTPS_PORT: "9443", TDK_POSTGRES_PORT: "9432" },
      isAvailable: free,
    });
    expect(formatPortFallbackNotice(plan)).toEqual([]);
  });

  it("lists only Postgres when ports 80 and 443 are free", async () => {
    const plan = await createHostPortPlan({ env: {}, isAvailable: free });
    expect(formatPortFallbackNotice(plan).map((line) => line.split(":")[0])).toEqual(["Postgres"]);
  });

  it("stays silent when the requested port was available and chosen", async () => {
    const plan = await createHostPortPlan({
      env: {},
      isAvailable: free,
      ranges: {
        ingressHttp: { start: 80, end: 80 },
        ingressHttps: { start: 443, end: 443 },
        postgres: { start: 5432, end: 5432 },
      },
    });
    expect(formatPortFallbackNotice(plan)).toEqual([]);
  });
});
