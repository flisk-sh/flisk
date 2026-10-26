// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { findPortOccupant } from "../port-occupant.js";

describe("findPortOccupant", () => {
  it("names the listening process by its program name", () => {
    const runner = vi.fn((command: string) =>
      command === "lsof" ? "4321\n" : "/opt/homebrew/bin/postgres\n",
    );
    expect(findPortOccupant(5432, "darwin", runner)).toEqual({ pid: 4321, command: "postgres" });
    expect(runner).toHaveBeenNthCalledWith(1, "lsof", ["-nP", "-t", "-iTCP:5432", "-sTCP:LISTEN"]);
    expect(runner).toHaveBeenNthCalledWith(2, "ps", ["-p", "4321", "-o", "comm="]);
  });

  it("returns null when nothing listens (lsof exits 1)", () => {
    const runner = () => {
      throw Object.assign(new Error("exit 1"), { status: 1 });
    };
    expect(findPortOccupant(9000, "darwin", runner)).toBeNull();
  });

  it("returns null when lsof is missing", () => {
    const runner = () => {
      throw Object.assign(new Error("lsof unavailable"), { code: "ENOENT" });
    };
    expect(findPortOccupant(9000, "darwin", runner)).toBeNull();
  });

  it("returns null when the process exits before ps reads it", () => {
    const runner = (command: string) => {
      if (command === "lsof") return "4321\n";
      throw new Error("ps: no such process");
    };
    expect(findPortOccupant(9000, "darwin", runner)).toBeNull();
  });

  it("does not look on Windows", () => {
    const runner = vi.fn(() => "1\n");
    expect(findPortOccupant(9000, "win32", runner)).toBeNull();
    expect(runner).not.toHaveBeenCalled();
  });
});
