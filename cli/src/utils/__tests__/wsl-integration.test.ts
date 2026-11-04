// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { checkDockerFileSharing } from "../docker-file-sharing.js";
import { detectPlatformKind } from "../platform.js";
import { checkDockerWslIntegration } from "../wsl-integration.js";

describe("detectPlatformKind", () => {
  it("tells native Windows, WSL2, Linux and macOS apart", () => {
    expect(detectPlatformKind({ platform: "win32", env: {}, release: "" })).toBe("windows");
    expect(detectPlatformKind({ platform: "darwin", env: {}, release: "" })).toBe("macos");
    expect(detectPlatformKind({ platform: "linux", env: {}, release: "6.1.0-generic" })).toBe(
      "linux",
    );
    expect(
      detectPlatformKind({ platform: "linux", env: { WSL_DISTRO_NAME: "Ubuntu" }, release: "" }),
    ).toBe("wsl2");
    expect(
      detectPlatformKind({ platform: "linux", env: {}, release: "5.15.1-microsoft-standard-WSL2" }),
    ).toBe("wsl2");
  });
});

describe("WSL2 doctor advice", () => {
  it("skips the Docker Desktop file sharing check inside WSL2", async () => {
    const result = await checkDockerFileSharing({ isWsl: true, hasDocker: true });
    expect(result.isSkipped).toBe(true);
    expect(result.fix).toBeUndefined();
    expect(result.message).not.toContain("Settings → Resources → File sharing");
  });

  it("checks WSL integration inside WSL2 and skips it elsewhere", () => {
    expect(checkDockerWslIntegration({ isWsl: false }).isSkipped).toBe(true);
    const missing = checkDockerWslIntegration({ isWsl: true, hasDocker: false });
    expect(missing.didPass).toBe(false);
    expect(missing.fix).toContain("WSL Integration");
    const down = checkDockerWslIntegration({
      isWsl: true,
      hasDocker: true,
      pingDaemon: () => {
        throw new Error("no daemon");
      },
    });
    expect(down.didPass).toBe(false);
    expect(
      checkDockerWslIntegration({ isWsl: true, hasDocker: true, pingDaemon: () => {} }).didPass,
    ).toBe(true);
  });
});
