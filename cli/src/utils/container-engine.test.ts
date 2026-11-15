// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { detectEngine, parseDockerInfo } from "./container-engine.js";

describe("detectEngine", () => {
  it("names Kiri from what its daemon reports (recorded from Kiri 0.2.1)", () => {
    const info = { Name: "kiri", OperatingSystem: "Kiri", ServerVersion: "27.5.1" };
    expect(detectEngine(info, {})).toEqual({
      id: "kiri",
      label: "Kiri (engine 27.5.1)",
      vm: true,
    });
  });

  it("names Kiri from its socket when the daemon says nothing", () => {
    const env = { DOCKER_HOST: "unix:///Users/me/.kiri/run/docker.sock" };
    expect(detectEngine({}, env).id).toBe("kiri");
  });

  it("lets the daemon win over a stale DOCKER_CONTEXT", () => {
    const info = { Name: "colima", OperatingSystem: "Ubuntu 24.04 LTS" };
    expect(detectEngine(info, { DOCKER_CONTEXT: "default" }).id).toBe("colima");
  });

  it("tells the other engines apart", () => {
    expect(detectEngine({ OperatingSystem: "OrbStack" }, {}).id).toBe("orbstack");
    expect(detectEngine({ OperatingSystem: "Docker Desktop" }, {}).id).toBe("docker-desktop");
    expect(detectEngine({ OperatingSystem: "Ubuntu 24.04" }, {}).id).toBe("docker-engine");
    expect(detectEngine({}, {}).id).toBe("unknown");
  });
});

describe("parseDockerInfo", () => {
  it("returns an empty answer for text that is not JSON", () => {
    expect(parseDockerInfo("Cannot connect")).toEqual({});
  });
});
