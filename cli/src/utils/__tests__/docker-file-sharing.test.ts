// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkDockerFileSharing,
  DOCKER_FILE_SHARING_CHECK,
  formatDockerFileSharingFix,
} from "../docker-file-sharing.js";

describe("checkDockerFileSharing", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-docker-share-test-"));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup best effort
    }
  });

  it("passes when the folder is shared and removes the probe file", async () => {
    let capturedArgs: string[] = [];
    const fakeRunner = async (args: string[]) => {
      capturedArgs = args;
      // Extract probe filename from the command argument
      const cmd = args[args.length - 1] ?? "";
      const match = cmd.match(/\/flisk-probe\/(\.flisk-probe-[a-z0-9-]+)/);
      if (match?.[1]) {
        // Simulate container writing to host through bind mount
        writeFileSync(join(tempDir, match[1]), "probe content\n");
      }
      return "";
    };

    const result = await checkDockerFileSharing({
      projectRoot: tempDir,
      runner: fakeRunner,
      hasDocker: true,
    });

    expect(result.name).toBe(DOCKER_FILE_SHARING_CHECK);
    expect(result.didPass).toBe(true);
    expect(result.message).toContain(tempDir);

    // Verify container removal flag (--rm) was used
    expect(capturedArgs).toContain("--rm");
    expect(capturedArgs).toContain("-v");
    expect(capturedArgs).toContain(`${tempDir}:/flisk-probe`);

    // Verify probe file was removed from the host
    const files = existsSync(tempDir);
    expect(files).toBe(true);
    // The probe file inside tempDir should no longer exist
    const probeFiles = (args: string[]) => {
      const match = (args[args.length - 1] ?? "").match(
        /\/flisk-probe\/(\.flisk-probe-[a-z0-9-]+)/,
      );
      return match?.[1] ? existsSync(join(tempDir, match[1])) : false;
    };
    expect(probeFiles(capturedArgs)).toBe(false);
  });

  it("fails with fix when the folder is not shared into the VM", async () => {
    // Fake runner runs successfully inside VM, but does NOT create file on host
    const fakeRunner = async () => "";

    const result = await checkDockerFileSharing({
      projectRoot: tempDir,
      runner: fakeRunner,
      hasDocker: true,
    });

    expect(result.name).toBe(DOCKER_FILE_SHARING_CHECK);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain(tempDir);
    expect(result.message).toContain("bind mounts silently stay inside the VM");

    // Fix must name the folder and how to share it
    expect(result.fix).toContain(tempDir);
    expect(result.fix).toContain("Docker Desktop: Settings → Resources → File sharing");
    expect(result.fix).toContain("Colima: start with --mount");
    expect(result.fix).toContain("Remote engine");
  });

  it("fails with fix when docker run rejects the mount", async () => {
    const fakeRunner = async () => {
      throw new Error("docker: Error response from daemon: Mounts denied.");
    };

    const result = await checkDockerFileSharing({
      projectRoot: tempDir,
      runner: fakeRunner,
      hasDocker: true,
    });

    expect(result.name).toBe(DOCKER_FILE_SHARING_CHECK);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("Docker cannot access the project folder");
    expect(result.fix).toContain(tempDir);
    expect(result.fix).toContain("File sharing");
  });

  it("skips when Docker CLI is not installed", async () => {
    const result = await checkDockerFileSharing({
      projectRoot: tempDir,
      hasDocker: false,
    });

    expect(result.name).toBe(DOCKER_FILE_SHARING_CHECK);
    expect(result.didPass).toBe(true);
    expect(result.isSkipped).toBe(true);
  });
});

describe("formatDockerFileSharingFix", () => {
  it("formats instructions for Docker Desktop, Colima, and remote engines", () => {
    const fix = formatDockerFileSharingFix("/Users/sunny/my-project");
    expect(fix).toContain("/Users/sunny/my-project");
    expect(fix).toContain("Docker Desktop: Settings → Resources → File sharing");
    expect(fix).toContain(
      "Colima: start with --mount (e.g. colima start --mount /Users/sunny/my-project)",
    );
    expect(fix).toContain("Remote engine: run Flisk directly on that host");
  });
});
