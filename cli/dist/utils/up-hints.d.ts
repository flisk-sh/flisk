/** Troubleshooting entries the hints point at. Each anchor is a heading in docs/troubleshooting.md. */
export declare const UP_HINT_DOCS: {
    readonly coldStart: "https://github.com/flisk-sh/flisk/blob/main/docs/troubleshooting.md#cold-start-blocked-docker-or-tilt-missing";
    readonly unhealthy: "https://github.com/flisk-sh/flisk/blob/main/docs/troubleshooting.md#services-never-turn-healthy-or-are-left-behind";
    readonly smoke: "https://github.com/flisk-sh/flisk/blob/main/docs/smoke.md";
};
/**
 * A warning for a CI job that ran plain `flisk up`, or null anywhere else. That command stays attached to stream logs, so
 * the job would sit there until it times out, with nothing in its log saying why.
 */
export declare function attachedUpInCiWarning(env: NodeJS.ProcessEnv): string | null;
/** The ways `flisk up` fails after its arguments are accepted, each with its own next step. */
export type UpFailure = {
    kind: "machine";
} | {
    kind: "invalid-tilt-port";
} | {
    kind: "tilt-exited";
} | {
    kind: "services";
    failed: string[];
    timedOut?: boolean;
    stillBuilding?: string[];
} | {
    kind: "smoke";
    failed: string[];
};
/**
 * One or two commands to run next after a failed `flisk up`, plus the troubleshooting page for that failure. Printed
 * under the error and, with `--json`, carried in the error's `suggestions` field.
 */
export declare function upFailureHints(failure: UpFailure): string[];
