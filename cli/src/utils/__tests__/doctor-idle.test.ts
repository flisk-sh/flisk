// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  checkIdleProjects,
  DEFAULT_IDLE_HOURS,
  formatUptime,
  parseEtime,
  parseRunningProjects,
} from "../doctor-idle.js";

const isProject = (): boolean => true; // PS fixtures are POSIX paths from a macOS/Linux host.

describe("parseEtime", () => {
  it("reads ps elapsed times", () => {
    expect(parseEtime("01:23")).toBe(83);
    expect(parseEtime("40:15:09")).toBe(144909);
    expect(parseEtime("2-03:04:05")).toBe(183845);
    expect(parseEtime("junk")).toBe(0);
  });
});

describe("parseRunningProjects", () => {
  it("keeps only live tilt up processes whose Tiltfile belongs to a project", () => {
    const ps = [
      " 123 43:12:00 /usr/local/bin/tilt up -f /work/bot/.flisk/.flisk-out/Tiltfile",
      " 124 10:00:00 tilt down -f /work/bot/.flisk/.flisk-out/Tiltfile",
      " 125 50:00:00 tilt up -f /tmp/gone/.flisk/.flisk-out/Tiltfile",
      " 126 01:00:00 node server.js",
    ].join("\n");
    expect(parseRunningProjects(ps, (root) => root === "/work/bot")).toEqual([
      { root: "/work/bot", uptimeSeconds: 43 * 3600 + 12 * 60 },
    ]);
  });
});

describe("checkIdleProjects (#4296)", () => {
  it("passes quietly when no project has been up past the threshold", () => {
    const ps = " 1 47:59:59 tilt up -f /work/bot/.flisk/.flisk-out/Tiltfile";
    const result = checkIdleProjects({
      psOutput: ps,
      dockerOutput: "",
      volumeOutput: "",
      isProject,
    });
    expect(result.didPass).toBe(true);
    expect(result.message).toContain(`${DEFAULT_IDLE_HOURS}h`);
  });

  it("names long-running projects with container and volume details and a down command", () => {
    const ps = [
      " 1 2-01:00:00 tilt up -f /work/bot/.flisk/.flisk-out/Tiltfile",
      " 2 49:00:00 tilt up -f /work/fresh/.flisk/.flisk-out/Tiltfile",
    ].join("\n");
    const dockerOutput = ["bot-web-1\t12.4MB", "bot_postgres\t1.2GB", "fresh-web-1\t1MB"].join(
      "\n",
    );
    const volumeOutput = ["bot_db\tbot", "bot_nats\tbot", "other_db\tother"].join("\n");
    const result = checkIdleProjects({
      psOutput: ps,
      dockerOutput,
      volumeOutput,
      isProject,
    });
    expect(result.didPass).toBe(false);
    expect(result.isWarning).toBe(true);
    expect(result.message).toContain("2 Flisk projects have been up");
    expect(result.message).toContain(
      "/work/bot (bot): 2d 1h up, 2 containers, 1241.2 MB of container data, 2 volumes",
    );
    expect(result.message).toContain("flisk down --project /work/bot");
    expect(result.message).toContain("/work/fresh (fresh)");
    expect(result.fix).toContain("flisk projects --stale --prune");
    expect(formatUptime(49 * 3600)).toBe("2d 1h");
  });

  it("reads the elapsed time of a process that has been up for days", () => {
    const ps = " 1 3-02:00:00 tilt up -f /work/bot/.flisk/.flisk-out/Tiltfile";
    const result = checkIdleProjects({
      psOutput: ps,
      isProject,
      dockerOutput: "",
      volumeOutput: "",
    });
    expect(result.message).toContain("3d 2h up");
  });
});
