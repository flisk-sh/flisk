// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { hostUpRefusal } from "../../commands/up.js";
import {
  DEVCONTAINER_DOCKER_FIX,
  detectHost,
  type HostProbeInputs,
  isContainerHost,
  WEBCONTAINER_DOCS,
  WEBCONTAINER_UP_MESSAGE,
} from "../agent-host.js";
import { createDoctorReport } from "../doctor-report.js";

const base: HostProbeInputs = {
  env: {},
  versions: process.versions,
  platform: "linux",
  fileExists: () => false,
};

describe("detectHost", () => {
  it("detects a WebContainer and refuses up", () => {
    const host = detectHost({
      ...base,
      versions: { ...process.versions, webcontainer: "1" } as never,
    });
    expect(host).toEqual({ kind: "webcontainer", canUp: false });
  });
  it("detects Codespaces before the generic Dev Container", () => {
    expect(
      detectHost({ ...base, env: { CODESPACES: "true", REMOTE_CONTAINERS: "true" } }).kind,
    ).toBe("codespaces");
  });
  it("detects a Dev Container via REMOTE_CONTAINERS", () => {
    expect(detectHost({ ...base, env: { REMOTE_CONTAINERS: "true" } }).kind).toBe("devcontainer");
  });
  it("detects a Dev Container via /.dockerenv and DEVCONTAINER env", () => {
    expect(
      detectHost({
        ...base,
        fileExists: (p) => p === "/.dockerenv",
        env: { DEVCONTAINER: "true" },
      }).kind,
    ).toBe("devcontainer");
  });
  it("does not treat a bare /.dockerenv without DEVCONTAINER as a Dev Container", () => {
    expect(detectHost({ ...base, fileExists: (p) => p === "/.dockerenv" }).kind).toBe("local");
  });
  it("ignores DEVCONTAINER env if /.dockerenv does not exist", () => {
    expect(
      detectHost({
        ...base,
        fileExists: () => false,
        env: { DEVCONTAINER: "true" },
      }).kind,
    ).toBe("local");
  });
  it("reports native Windows as unable to up unless explicitly allowed", () => {
    expect(detectHost({ ...base, platform: "win32" })).toEqual({
      kind: "native-windows",
      canUp: false,
    });
    expect(
      detectHost({ ...base, platform: "win32", env: { TDK_ALLOW_NATIVE_WINDOWS: "1" } }).canUp,
    ).toBe(true);
  });
  it("detects WSL2 and plain local hosts", () => {
    expect(detectHost({ ...base, env: { WSL_DISTRO_NAME: "Ubuntu" } }).kind).toBe("wsl2");
    expect(detectHost(base).kind).toBe("local");
  });
  it("uses default process inputs when invoked with no arguments", () => {
    const host = detectHost();
    expect([
      "webcontainer",
      "codespaces",
      "devcontainer",
      "wsl2",
      "native-windows",
      "local",
    ]).toContain(host.kind);
    expect(typeof host.canUp).toBe("boolean");
  });
});

describe("isContainerHost", () => {
  it.each([
    ["codespaces", true],
    ["devcontainer", true],
    ["local", false],
    ["native-windows", false],
    ["wsl2", false],
    ["webcontainer", false],
  ] as const)("identifies container host kind %s as %s", (kind, expected) => {
    expect(isContainerHost(kind)).toBe(expected);
  });
});

describe("host constants and messages", () => {
  it("exports consistent remediation and doc paths", () => {
    expect(WEBCONTAINER_DOCS).toBe("docs/agent-hosts.md");
    expect(WEBCONTAINER_UP_MESSAGE).toContain(WEBCONTAINER_DOCS);
    expect(WEBCONTAINER_UP_MESSAGE).toContain("WebContainers cannot run Flisk");
    expect(DEVCONTAINER_DOCKER_FIX).toContain(WEBCONTAINER_DOCS);
    expect(DEVCONTAINER_DOCKER_FIX).toContain("docker-outside-of-docker");
  });
});

describe("hostUpRefusal", () => {
  it("refuses a WebContainer without probing Docker", async () => {
    const probe = async () => {
      throw new Error("must not probe");
    };
    expect(await hostUpRefusal({ kind: "webcontainer", canUp: false }, probe)).toMatch(
      /WebContainers/,
    );
  });
  it("gives Dev Container remediation when Docker is unreachable", async () => {
    expect(await hostUpRefusal({ kind: "devcontainer", canUp: true }, async () => false)).toMatch(
      /Dev Container/,
    );
  });
  it("allows reachable Docker and never probes on a local host", async () => {
    expect(await hostUpRefusal({ kind: "devcontainer", canUp: true }, async () => true)).toBeNull();
    expect(await hostUpRefusal({ kind: "local", canUp: true }, async () => false)).toBeNull();
  });
});

describe("doctor report host", () => {
  it("sets canUp false when the container runtime check failed", () => {
    const report = createDoctorReport(
      [{ name: "Container Runtime", didPass: false, message: "down" }],
      false,
      [],
      undefined,
      { kind: "devcontainer", canUp: true },
    );
    expect(report.data.host).toEqual({
      kind: "devcontainer",
      canUp: false,
      containerRuntimeReachable: false,
    });
  });
});
