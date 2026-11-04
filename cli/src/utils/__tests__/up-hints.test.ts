// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { logsCommand } from "../../commands/logs.js";
import { upCommand } from "../../commands/up.js";
import { UP_HINT_DOCS, upFailureHints } from "../up-hints.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..", "..");

/** GitHub's heading anchor: lower case, punctuation dropped, spaces to hyphens. */
function anchorsOf(markdown: string): Set<string> {
  return new Set(
    markdown
      .split("\n")
      .filter((line) => /^#{1,6} /.test(line))
      .map((line) =>
        line
          .replace(/^#+ /, "")
          .toLowerCase()
          .replace(/[^\p{L}\p{N} _-]/gu, "")
          .replace(/ /g, "-"),
      ),
  );
}

describe("upFailureHints", () => {
  it("sends a machine failure to flisk doctor, the no-Docker path and the cold-start entry", () => {
    expect(upFailureHints({ kind: "machine" })).toEqual([
      "Fix the checks above, then run: flisk doctor",
      expect.stringMatching(/^No Docker\? .*\/run-without-docker\.md$/),
      `Troubleshooting: ${UP_HINT_DOCS.coldStart}`,
    ]);
  });

  it("names the first failed service in a flisk logs command", () => {
    const hints = upFailureHints({ kind: "services", failed: ["api", "web"] });
    expect(hints[0]).toBe("See why api failed: flisk logs -s api");
    expect(hints).toContain("Check the whole stack: flisk doctor");
    expect(hints).toContain(`Troubleshooting: ${UP_HINT_DOCS.unhealthy}`);
  });

  it("still gives a next command when no service is named (a timeout)", () => {
    expect(upFailureHints({ kind: "services", failed: [] })[0]).toBe(
      "Check the whole stack: flisk doctor",
    );
  });

  it("suggests flisk up again with cached layers and --wait-timeout when timed out while building", () => {
    const hints = upFailureHints({
      kind: "services",
      failed: [],
      timedOut: true,
      stillBuilding: ["api"],
    });
    expect(hints).toContain("Run flisk up again to resume with cached image layers: flisk up");
    expect(hints).toContain("Increase the timeout with: flisk up --wait-timeout <seconds>");
    expect(hints).toContain("Check the whole stack: flisk doctor");
  });

  it("suggests --wait-timeout when timed out waiting for services to start", () => {
    const hints = upFailureHints({
      kind: "services",
      failed: [],
      timedOut: true,
      stillBuilding: [],
    });
    expect(hints).not.toContain("Run flisk up again to resume with cached image layers: flisk up");
    expect(hints).toContain("Increase the timeout with: flisk up --wait-timeout <seconds>");
  });

  it("points a smoke failure at the service's logs and the smoke docs", () => {
    expect(upFailureHints({ kind: "smoke", failed: ["api"] })).toEqual([
      "See why api failed: flisk logs -s api",
      `Smoke checks: ${UP_HINT_DOCS.smoke}`,
    ]);
  });

  it("gives Tilt exiting and a bad TILT_PORT a command to run", () => {
    expect(upFailureHints({ kind: "tilt-exited" })).toEqual([
      "Check Docker, Tilt and the project: flisk doctor",
      "Rerun with Tilt's own output: flisk up --verbose",
    ]);
    expect(upFailureHints({ kind: "invalid-tilt-port" })).toEqual([
      "Unset it to use the default port: unset TILT_PORT",
    ]);
  });

  it("links only docs and headings that exist in the repository", () => {
    for (const url of Object.values(UP_HINT_DOCS)) {
      const [path, anchor] = url
        .replace("https://github.com/flisk-sh/flisk/blob/main/", "")
        .split("#");
      const file = join(repoRoot, path ?? "");
      expect(existsSync(file), path).toBe(true);
      if (anchor) expect(anchorsOf(readFileSync(file, "utf8")), url).toContain(anchor);
    }
  });

  it("uses only flags the commands accept", () => {
    const flags = (command: { options: readonly { short?: string; long?: string }[] }) =>
      command.options.flatMap((option) => [option.short, option.long]);
    expect(flags(logsCommand)).toContain("-s");
    expect(flags(upCommand)).toContain("--verbose");
  });
});
