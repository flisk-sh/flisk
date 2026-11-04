// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  formatColdPreflight,
  MACHINE_CHECK_IDS,
  nodeTooOld,
  type PreflightItem,
  type PreflightResult,
  RUNTIME_CHECK_IDS,
  requireVerifiedDockerVersions,
  SCAFFOLD_CHECK_IDS,
  usesPrisma,
} from "./cold-preflight.js";

function result(items: PreflightItem[], inProject = false): PreflightResult {
  const machineFailed = items.some((item) =>
    ["node", "docker", "compose", "tilt", "bun", "ports"].includes(item.id),
  );
  return {
    ok: items.length === 0,
    inProject,
    scope: "runtime",
    items,
    header:
      items.length === 0
        ? ""
        : machineFailed
          ? "Cold start blocked. Bun/Prisma/NATS are not the first failure.\nThey are generated after `flisk project`. Fix the machine checks below."
          : "Machine is ready. Project wiring is not.",
    footer: "",
  };
}

describe("cold preflight", () => {
  // These assertions intentionally pin the cold-preflight check IDs.
  // Deliberate additions, removals, renames, or ordering changes must be reflected in these tests.
  it("pins the runtime, scaffold, and machine check ID lists", () => {
    expect(RUNTIME_CHECK_IDS).toEqual(["docker", "compose", "tilt"]);
    expect(SCAFFOLD_CHECK_IDS).toEqual(["node", "bun", "ports"]);
    expect(MACHINE_CHECK_IDS).toEqual(["node", "docker", "compose", "tilt", "bun", "ports"]);
  });

  it("compares Node major and minor against 22.12", () => {
    expect(nodeTooOld("18.20.0")).toBe(true);
    expect(nodeTooOld("22.11.0")).toBe(true);
    expect(nodeTooOld("22.12.0")).toBe(false);
    expect(nodeTooOld("24.0.0")).toBe(false);
  });

  it("treats an unverified Docker version as a failed prerequisite", () => {
    const check = requireVerifiedDockerVersions({
      name: "Docker Versions",
      didPass: true,
      isSkipped: true,
      message: "Could not read Docker Engine/Compose versions",
    });
    expect(check.didPass).toBe(false);
    expect(check.isSkipped).toBe(false);
    expect(check.message).toContain("Could not verify Docker Engine/Compose minimum versions");
  });

  it("shows the cold-start header when a machine prerequisite fails", () => {
    const output = formatColdPreflight(
      result([{ id: "docker", ok: false, message: "Docker is not running" }]),
    );
    expect(output).toContain("Cold start blocked. Bun/Prisma/NATS are not the first failure.");
  });

  it("distinguishes project wiring failures from machine failures", () => {
    const output = formatColdPreflight(
      result([{ id: "nats", ok: false, message: "NATS broker is missing" }], true),
    );
    expect(output).toContain("Machine is ready. Project wiring is not.");
    expect(output).not.toContain("Cold start blocked.");
  });

  it("renders checks in fixed rank order", () => {
    const order: PreflightItem["id"][] = [
      "node",
      "docker",
      "compose",
      "tilt",
      "bun",
      "ports",
      "nats",
      "prisma",
    ];
    const output = formatColdPreflight(result(order.map((id) => ({ id, ok: false, message: id }))));
    const positions = order.map((id) => output.indexOf(`FAIL ${id.padEnd(7)}`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("does not render project-only Prisma failures outside a project", () => {
    const output = formatColdPreflight(
      result([{ id: "tilt", ok: false, message: "Tilt CLI not found" }]),
    );
    expect(output).not.toContain("prisma");
  });

  describe("usesPrisma", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), "flisk-cold-preflight-"));
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    it("returns true for a project whose service declares Prisma", () => {
      const serviceDir = join(tmp, "services", "api");
      mkdirSync(serviceDir, { recursive: true });
      writeFileSync(
        join(serviceDir, "service.json"),
        JSON.stringify({
          appName: "api",
          appType: "backend",
          featuresEnabled: ["prisma"],
        }),
      );
      expect(usesPrisma(tmp)).toBe(true);
    });

    it("returns false for a project whose service does not declare Prisma", () => {
      const serviceDir = join(tmp, "services", "api");
      mkdirSync(serviceDir, { recursive: true });
      writeFileSync(
        join(serviceDir, "service.json"),
        JSON.stringify({
          appName: "api",
          appType: "backend",
          featuresEnabled: ["messaging"],
        }),
      );
      expect(usesPrisma(tmp)).toBe(false);
    });

    it("returns false for a project without services", () => {
      expect(usesPrisma(tmp)).toBe(false);
    });

    it("returns false when resource discovery throws an error", () => {
      expect(usesPrisma(join(tmp, "non-existent-directory"))).toBe(false);
    });
  });
});
