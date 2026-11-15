// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  currentDockerContext,
  detectEngine,
  kiriBuildEnv,
  parseDockerInfo,
} from "./container-engine.js";

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

describe("kiriBuildEnv", () => {
  it("picks the classic builder on a Kiri socket", () => {
    const env = { DOCKER_HOST: "unix:///Users/me/.kiri/run/docker.sock" };
    expect(kiriBuildEnv(env, undefined)).toEqual({ DOCKER_BUILDKIT: "0" });
  });

  it("picks it when the Docker context is kiri and nothing overrides it", () => {
    expect(kiriBuildEnv({}, "kiri")).toEqual({ DOCKER_BUILDKIT: "0" });
    expect(kiriBuildEnv({ DOCKER_CONTEXT: "kiri" }, "colima")).toEqual({ DOCKER_BUILDKIT: "0" });
  });

  it("leaves other engines and an explicit choice alone", () => {
    expect(kiriBuildEnv({}, "colima")).toEqual({});
    expect(
      kiriBuildEnv({ DOCKER_HOST: "unix:///Users/me/.colima/default/docker.sock" }, "kiri"),
    ).toEqual({});
    expect(kiriBuildEnv({ DOCKER_BUILDKIT: "1" }, "kiri")).toEqual({});
  });
});

describe("currentDockerContext", () => {
  it("reads currentContext and survives a missing file", () => {
    expect(currentDockerContext("/h", () => '{"currentContext":"kiri"}')).toBe("kiri");
    expect(
      currentDockerContext("/h", () => {
        throw new Error("ENOENT");
      }),
    ).toBeUndefined();
  });
});
