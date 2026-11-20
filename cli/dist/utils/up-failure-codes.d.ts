/**
 * One classifier for the `failures[]` entries of `flisk up --json` and the MCP `up` tool.
 *
 * A failure arrives as free text (`reason`/`message`) plus, when the service wrote anything, its last `logs`. The code is
 * inferred from those, in priority order: a missing program wins over a port conflict, a dependency failure over a
 * health check, and a health check over a crash loop. `exitCode` is the service's last exit code when the runtime knows
 * it, otherwise what the text says, otherwise null. Nothing here touches the filesystem: the same classifier is used
 * for local-process and container/Tilt failures so the same cause gets the same code.
 */
export declare const UP_FAILURE_CODES: readonly ["PROGRAM_NOT_FOUND", "PORT_IN_USE", "HEALTHCHECK_FAILED", "CRASH_LOOP", "DEPENDENCY_FAILED", "UNKNOWN"];
export type UpFailureCode = (typeof UP_FAILURE_CODES)[number];
export interface UpFailureInput {
    name: string;
    reason?: string;
    message?: string;
    logs?: string[];
    /** Last exit code of the service, or null when it never exited. */
    exitCode?: number | null;
    /** Set when the producer already knows which command was missing. */
    program?: string;
    fix?: string;
    suggestions?: string[];
}
export type ClassifiedUpFailure<T extends UpFailureInput = UpFailureInput> = Omit<T, "code" | "reason" | "exitCode" | "suggestions"> & {
    name: string;
    /** Human text, without a pointer to terminal output a JSON/MCP caller never saw. */
    reason: string;
    exitCode: number | null;
    code: UpFailureCode;
    suggestions: string[];
    /** The missing executable, when the cause is PROGRAM_NOT_FOUND. */
    program?: string;
};
/** Reason for a machine caller: no "see its output above", and no dangling punctuation after its removal. */
export declare function machineUpFailureReason(failure: UpFailureInput): string;
/** Enrich one failure with the fields every `--json` and MCP `up` failure carries. */
export declare function classifyUpFailure<T extends UpFailureInput>(failure: T): ClassifiedUpFailure<T>;
/** Classify every failure in a result. Existing `logs`, `fix` and other fields are preserved. */
export declare function withUpFailureCodes<T extends UpFailureInput>(failures: readonly T[]): Array<ClassifiedUpFailure<T>>;
