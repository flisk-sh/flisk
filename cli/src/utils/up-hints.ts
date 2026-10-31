// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

const DOCS = "https://github.com/flisk-sh/flisk/blob/main/docs";

/** Troubleshooting entries the hints point at. Each anchor is a heading in docs/troubleshooting.md. */
export const UP_HINT_DOCS = {
  coldStart: `${DOCS}/troubleshooting.md#cold-start-blocked-docker-or-tilt-missing`,
  unhealthy: `${DOCS}/troubleshooting.md#services-never-turn-healthy-or-are-left-behind`,
  smoke: `${DOCS}/smoke.md`,
} as const;

/** The ways `flisk up` fails after its arguments are accepted, each with its own next step. */
export type UpFailure =
  | { kind: "machine" }
  | { kind: "invalid-tilt-port" }
  | { kind: "tilt-exited" }
  | { kind: "services"; failed: string[] }
  | { kind: "smoke"; failed: string[] };

/**
 * One or two commands to run next after a failed `flisk up`, plus the troubleshooting page for that failure. Printed
 * under the error and, with `--json`, carried in the error's `suggestions` field.
 */
export function upFailureHints(failure: UpFailure): string[] {
  switch (failure.kind) {
    case "machine":
      return [
        "Fix the checks above, then run: flisk doctor",
        `No Docker? Services that each declare a command run as local processes: ${DOCS}/run-without-docker.md`,
        `Troubleshooting: ${UP_HINT_DOCS.coldStart}`,
      ];
    case "invalid-tilt-port":
      return ["Unset it to use the default port: unset TILT_PORT"];
    case "tilt-exited":
      return [
        "Check Docker, Tilt and the project: flisk doctor",
        "Rerun with Tilt's own output: flisk up --verbose",
      ];
    case "services":
    case "smoke": {
      const logs =
        failure.failed.length > 0
          ? [`See why ${failure.failed[0]} failed: flisk logs -s ${failure.failed[0]}`]
          : [];
      return failure.kind === "smoke"
        ? [...logs, `Smoke checks: ${UP_HINT_DOCS.smoke}`]
        : [
            ...logs,
            "Check the whole stack: flisk doctor",
            `Troubleshooting: ${UP_HINT_DOCS.unhealthy}`,
          ];
    }
  }
}
