// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { findExternallyOccupiedPorts, parseExcludedPortRanges } from "./windows-doctor.js";

describe("parseExcludedPortRanges", () => {
  it("parses numeric Hyper-V TCP range rows and ignores headings", () => {
    expect(
      parseExcludedPortRanges(
        "Protocol tcp Port Exclusion Ranges\nStart Port    End Port\n----------    --------\n80            80\n50000         50059     *",
      ),
    ).toEqual([
      [80, 80],
      [50000, 50059],
    ]);
  });
});

describe("findExternallyOccupiedPorts", () => {
  it("ignores ports held by the current Flisk project containers", () => {
    const holders = [
      { name: "demo_traefik", ports: "0.0.0.0:80->80/tcp", publishedPorts: [80] },
      { name: "another-postgres", ports: "0.0.0.0:5432->5432/tcp", publishedPorts: [5432] },
    ];
    expect(findExternallyOccupiedPorts([80, 5432], holders, "demo")).toEqual([5432]);
  });
});
