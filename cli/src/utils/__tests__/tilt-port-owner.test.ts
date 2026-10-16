// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { findTiltPortOwner, isForeignTilt } from "../tilt-port-owner.js";

const TILT = "tilt up -f /work/other/.tdk/.tdk-out/Tiltfile";

function runner(map: Record<string, string>) {
  return (command: string, args: string[]) => {
    const key = `${command} ${args.join(" ")}`;
    for (const [pattern, out] of Object.entries(map)) {
      if (key.includes(pattern)) return out;
    }
    throw Object.assign(new Error("exit 1"), { status: 1 });
  };
}

describe("findTiltPortOwner", () => {
  it("names the project whose tilt up listens on the port", () => {
    const owner = findTiltPortOwner(
      10350,
      "darwin",
      runner({ "-iTCP:10350": "24170\n", "-p 24170": `/opt/homebrew/bin/${TILT}\n` }),
    );
    expect(owner).toEqual({ pid: 24170, root: "/work/other" });
  });

  it("is unknown when the listener is not a tilt up", () => {
    const owner = findTiltPortOwner(
      10350,
      "darwin",
      runner({ "-iTCP:10350": "99\n", "-p 99": "node server.js\n" }),
    );
    expect(owner).toBeNull();
  });

  it("is unknown when lsof fails or on Windows", () => {
    expect(findTiltPortOwner(10350, "darwin", runner({}))).toBeNull();
    expect(findTiltPortOwner(10350, "win32", runner({ "-iTCP": "1" }))).toBeNull();
  });
});

describe("isForeignTilt", () => {
  it("is foreign only when the owner is known and is another project", () => {
    expect(isForeignTilt({ pid: 1, root: "/work/other" }, "/work/mine")).toBe(true);
    expect(isForeignTilt({ pid: 1, root: "/work/mine" }, "/work/mine")).toBe(false);
    expect(isForeignTilt(null, "/work/mine")).toBe(false);
  });
});
