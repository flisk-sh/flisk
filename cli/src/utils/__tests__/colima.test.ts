// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

import {
  type ColimaDeps,
  type ColimaStatus,
  checkColima,
  isColimaDocker,
  planColimaRepair,
} from "../colima.js";

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

describe("planColimaRepair", () => {
  it("returns undefined (no repair steps) for a healthy Colima setup", () => {
    const status: ColimaStatus = {
      isColima: true,
      running: true,
      arch: "aarch64",
    };
    expect(planColimaRepair(status, true)).toBeUndefined();
  });

  it("returns undefined when Docker does not run on Colima", () => {
    const status: ColimaStatus = {
      isColima: false,
      running: true,
    };
    expect(planColimaRepair(status, true)).toBeUndefined();
    expect(planColimaRepair(status, false)).toBeUndefined();
  });

  it("returns a 'start' step when the Colima VM is stopped", () => {
    const status: ColimaStatus = {
      isColima: true,
      running: false,
      problem: "The Colima VM is not running",
      fix: "Run `colima start`",
    };
    expect(planColimaRepair(status, false)).toBe("start");
  });

  it("returns a 'start' step when the Colima VM is missing or uninitialized", () => {
    const status: ColimaStatus = {
      isColima: true,
      running: false,
      problem: "The state of the Colima VM could not be read",
      fix: "Run `colima status` to see what it says",
    };
    expect(planColimaRepair(status, false)).toBe("start");
  });

  it("returns a 'restart' step when the Colima VM is running but the Docker daemon does not answer", () => {
    const status: ColimaStatus = {
      isColima: true,
      running: true,
      arch: "aarch64",
    };
    expect(planColimaRepair(status, false)).toBe("restart");
  });

  it("returns a 'native-lima' step when Lima is installed as an x86_64 build on Apple Silicon", () => {
    const status: ColimaStatus = {
      isColima: true,
      running: false,
      problem: "Lima is installed as an x86_64 build, so it cannot start the Colima VM on this Mac",
      fix: "Install a native Lima (brew reinstall lima, or use a native limactl on PATH) and run `colima start`",
    };
    expect(planColimaRepair(status, false)).toBe("native-lima");
  });

  it("returns a 'native-lima' step when the colima CLI cannot see the running VM", () => {
    const status: ColimaStatus = {
      isColima: true,
      running: true,
      problem: "The Colima VM is running, but the colima CLI on this PATH cannot see it",
      fix: "Use a native limactl",
    };
    expect(planColimaRepair(status, true)).toBe("native-lima");
  });
});
