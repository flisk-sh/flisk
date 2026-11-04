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

  it("does not blame file sharing when the probe container could not run at all", async () => {
    // A WSL2 user saw "Docker cannot access the project folder" while their bind mounts worked: the probe image pull failed.
    const fakeRunner = async () => {
      throw Object.assign(new Error("Command failed: docker run --rm alpine"), {
        stderr:
          "Unable to find image 'alpine:latest' locally\nError response from daemon: Get \"https://registry-1.docker.io/v2/\": net/http: TLS handshake timeout",
      });
    };

    const result = await checkDockerFileSharing({
      projectRoot: tempDir,
      runner: fakeRunner,
      hasDocker: true,
    });

    expect(result.didPass).toBe(true);
    expect(result.isSkipped).toBe(true);
    expect(result.message).toContain("file sharing was not tested");
    expect(result.message).toContain("Unable to find image 'alpine:latest' locally");
    // The cause on the next line is kept, not only the first line.
    expect(result.message).toContain("TLS handshake timeout");
    expect(result.fix).toBeUndefined();
  });

  it("does not blame file sharing for a daemon permission error before the probe starts", async () => {
    // docker run exits 125 when the daemon fails it: no container started, so the mount was never tried.
    const fakeRunner = async () => {
      throw Object.assign(new Error("Command failed: docker run"), {
        code: 125,
        stderr: "permission denied while trying to connect to the Docker daemon socket",
      });
    };

    const result = await checkDockerFileSharing({
      projectRoot: tempDir,
      runner: fakeRunner,
      hasDocker: true,
    });

    expect(result.isSkipped).toBe(true);
    expect(result.message).toContain("permission denied while trying to connect");
  });

  it("fails when the probe started but could not write into the mount", async () => {
    const fakeRunner = async () => {
      throw Object.assign(new Error("Command failed: docker run"), {
        code: 2,
        stderr: "sh: can't create /flisk-probe/x: Read-only file system",
      });
    };

    const result = await checkDockerFileSharing({
      projectRoot: tempDir,
      runner: fakeRunner,
      hasDocker: true,
    });

    expect(result.didPass).toBe(false);
    expect(result.message).toContain("Docker cannot access the project folder");
    expect(result.fix).toContain("File sharing");
  });

  it.each([
    [
      "an unauthorized image pull",
      125,
      "Error response from daemon: pull access denied for alpine, repository does not exist or may require 'docker login': denied: requested access to the resource is denied",
      true,
    ],
    [
      "the daemon being unreachable",
      1,
      "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?",
      true,
    ],
    [
      "Operation not permitted inside the started probe",
      1,
      "sh: can't create /flisk-probe/x: Operation not permitted",
      false,
    ],
    [
      "permission denied inside the started probe",
      2,
      "sh: can't create /flisk-probe/x: Permission denied",
      false,
    ],
    [
      "a mount Docker refuses before start",
      125,
      "Error response from daemon: Mounts denied: The path /p is not shared from the host",
      false,
    ],
  ])("classifies %s (exit %i)", async (_case, code, stderr, skipped) => {
    // Exit 1 for an unreachable daemon comes from the docker CLI itself, not from a container, so it is told apart by
    // Docker's own text; any other exit 1-124 is the probe's `sh` failing to write into the mount.
    const fakeRunner = async () => {
      throw Object.assign(new Error("Command failed: docker run"), { code, stderr });
    };

    const result = await checkDockerFileSharing({
      projectRoot: tempDir,
      runner: fakeRunner,
      hasDocker: true,
    });

    expect(Boolean(result.isSkipped)).toBe(skipped);
    expect(result.didPass).toBe(skipped);
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
