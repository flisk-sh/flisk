// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import type { DoctorAction } from "../../types/index.js";
import { ensureNetworkCapacity } from "../demo-networks.js";

const EXHAUSTED =
  "Error response from daemon: all predefined address pools have been fully subnetted";

function action(name: string, status: DoctorAction["status"]): DoctorAction {
  return {
    id: `remove-network:${name}`,
    check: "Docker networks",
    scope: "machine",
    command: `docker network rm ${name}`,
    status,
    reason: "unused network",
  };
}

describe("ensureNetworkCapacity", () => {
  it("does nothing when Docker can create a network", async () => {
    const planUnused = vi.fn();
    const result = await ensureNetworkCapacity({ probe: () => null, planUnused, apply: vi.fn() });
    expect(result).toEqual({ ok: true, removed: [] });
    expect(planUnused).not.toHaveBeenCalled();
  });

  it("leaves other probe failures to the stack", async () => {
    const planUnused = vi.fn();
    const result = await ensureNetworkCapacity({
      probe: () => "Cannot connect to the Docker daemon",
      planUnused,
      apply: vi.fn(),
    });
    expect(result.ok).toBe(true);
    expect(planUnused).not.toHaveBeenCalled();
  });

  it("removes only planned unused networks and succeeds once Docker has room", async () => {
    const probe = vi.fn().mockReturnValueOnce(EXHAUSTED).mockReturnValueOnce(null);
    const apply = vi.fn(async (actions: DoctorAction[]) =>
      actions.map((a) => ({ ...a, status: "applied" as const })),
    );
    const result = await ensureNetworkCapacity({
      probe,
      planUnused: async () => [
        action("old_backend", "planned"),
        action("busy_backend", "skipped"),
        { ...action("x", "planned"), id: "prune:images" },
      ],
      apply,
    });
    expect(apply).toHaveBeenCalledWith([action("old_backend", "planned")]);
    expect(result).toEqual({ ok: true, removed: ["old_backend"] });
  });

  it("reports failure when Docker is still full after the cleanup", async () => {
    const result = await ensureNetworkCapacity({
      probe: () => EXHAUSTED,
      planUnused: async () => [],
      apply: async (actions) => actions,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("fully subnetted");
  });
});
