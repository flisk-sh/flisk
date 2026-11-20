// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { createTempProject, parseEnvelope, runFlisk } from "../../test-support/index.js";

/**
 * Two-service end-to-end case for #4049: one declared test passes and one deliberately fails. Both services run as
 * local processes, so the case needs no Docker or Tilt; the CLI is spawned from the committed build.
 */
describe("flisk test with a pass and a deliberate failure", () => {
  it("returns one JSON result per service and exits non-zero", () => {
    const projectRoot = createTempProject({
      projectJson: {},
      stacks: {
        main: {
          passing: {
            appType: "backend",
            command: "node server.js",
            port: 4100,
            test: 'node -e "process.exit(0)"',
          },
          failing: {
            appType: "backend",
            command: "node server.js",
            port: 4101,
            test: "node -e \"console.error('boom'); process.exit(1)\"",
          },
        },
      },
    });

    const run = runFlisk(["test", "main", "--json"], { cwd: projectRoot });
    expect(run.status, run.stderr).toBe(1);

    const envelope = parseEnvelope(run.stdout);
    expect(envelope.data.ok).toBe(false);
    expect(envelope.data.summary).toEqual({ passed: 1, failed: 1, skipped: 0 });
    expect(envelope.data.results).toHaveLength(2);
    const passing = envelope.data.results.find(
      (result: { service: string }) => result.service === "passing",
    );
    const failing = envelope.data.results.find(
      (result: { service: string }) => result.service === "failing",
    );
    expect(passing).toMatchObject({
      service: "passing",
      command: 'node -e "process.exit(0)"',
      ok: true,
      status: "passed",
    });
    expect(failing).toMatchObject({
      service: "failing",
      ok: false,
      status: "failed",
    });
    expect(failing.outputTail).toContain("boom");
  });
});
