// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

import { type ColimaDeps, checkColima, isColimaDocker } from "../colima.js";

function deps(overrides: Partial<ColimaDeps> = {}): ColimaDeps {
  return {
    env: { DOCKER_HOST: "unix:///Users/me/.colima/default/docker.sock" },
    run: () => "colima is running using macOS Virtualization.Framework\narch: aarch64\n",
    exists: () => true,
    home: "/Users/me",
    dockerAnswers: () => true,
    ...overrides,
  };
}

describe("isColimaDocker", () => {
  it("is true when the Docker endpoint is a Colima socket", () => {
    expect(isColimaDocker(deps())).toBe(true);
  });

  it("is false for a plain Docker endpoint", () => {
    expect(
      isColimaDocker(
        deps({ env: { DOCKER_HOST: "unix:///var/run/docker.sock" }, exists: () => false }),
      ),
    ).toBe(false);
  });
});

describe("checkColima", () => {
  it("reports a running VM with its architecture", () => {
    const status = checkColima(deps());
    expect(status.isColima).toBe(true);
    expect(status.running).toBe(true);
    expect(status.arch).toBe("aarch64");
    expect(status.problem).toBeUndefined();
  });

  it("says nothing when Docker does not run on Colima", () => {
    const status = checkColima(
      deps({ env: { DOCKER_HOST: "unix:///var/run/docker.sock" }, exists: () => false }),
    );
    expect(status.isColima).toBe(false);
    expect(status.running).toBe(true);
  });

  it("reports a VM that is not running", () => {
    const status = checkColima(
      deps({
        dockerAnswers: () => false,
        run: () => {
          const error = new Error("colima not running") as Error & { stderr?: string };
          error.stderr = "time=... level=fatal msg=colima not running";
          throw error;
        },
      }),
    );
    expect(status.running).toBe(false);
    expect(status.problem).toContain("not running");
    expect(status.fix).toContain("colima start");
  });

  it("reports a Lima that cannot run on this architecture", () => {
    const status = checkColima(
      deps({
        dockerAnswers: () => false,
        run: () => {
          const error = new Error("lima compatibility error") as Error & { stderr?: string };
          error.stderr =
            "level=fatal msg=limactl is running under rosetta, please reinstall lima with native arch";
          throw error;
        },
      }),
    );
    expect(status.running).toBe(false);
    expect(status.problem).toContain("x86_64");
    expect(status.fix).toContain("native");
  });
});

describe("checkColima with a broken colima CLI", () => {
  it("says the VM is running when Docker answers but colima cannot see it", () => {
    const status = checkColima(
      deps({
        dockerAnswers: () => true,
        run: () => {
          const error = new Error("colima not running") as Error & { stderr?: string };
          error.stderr = "time=... level=fatal msg=colima not running";
          throw error;
        },
      }),
    );
    expect(status.running).toBe(true);
    expect(status.problem).toContain("cannot see it");
    expect(status.fix).toContain("native limactl");
  });

  it("says the VM is down when Docker does not answer either", () => {
    const status = checkColima(
      deps({
        dockerAnswers: () => false,
        run: () => {
          const error = new Error("colima not running") as Error & { stderr?: string };
          error.stderr = "time=... level=fatal msg=colima not running";
          throw error;
        },
      }),
    );
    expect(status.running).toBe(false);
    expect(status.fix).toContain("colima start");
  });
});

describe("checkColima with colima logging to stderr", () => {
  it("reads the status from stderr, the way colima logs it", () => {
    // colima prints its status as logrus lines on stderr; a check that only reads stdout
    // would call a healthy VM "not running".
    const status = checkColima(
      deps({
        run: () =>
          "time=... level=info msg=colima is running using macOS Virtualization.Framework\narch: aarch64\n",
      }),
    );
    expect(status.running).toBe(true);
    expect(status.arch).toBe("aarch64");
    expect(status.problem).toBeUndefined();
  });
});
