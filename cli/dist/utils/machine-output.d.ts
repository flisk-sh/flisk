import type { MachineError } from "../types/index.js";
export declare const SCHEMA_VERSION: 1;
export interface MachineEnvelope<T> {
    schemaVersion: typeof SCHEMA_VERSION;
    data: T | null;
    errors: MachineError[];
}
/** JSON envelope shape emitted by CLI `--json` commands (`schemaVersion`, `data`, `errors`). */
export type MachineOutputEnvelope = MachineEnvelope<unknown>;
export declare function createMachineEnvelope<T>(data: T | null, errors?: MachineError[]): MachineEnvelope<T>;
/** Narrows unknown JSON to the machine-output envelope used by CLI `--json` commands. */
export declare function isMachineOutputEnvelope(value: unknown): value is MachineOutputEnvelope;
export declare function toMachineError(error: unknown): {
    error: MachineError;
    exitCode: number;
};
/**
 * Writes the envelope as one compact line, so `tail -1`, `head -1` and line-oriented log shippers always read a whole
 * document from any `--json` command.
 */
export declare function writeMachineOutput(data: unknown, errors?: MachineError[]): void;
/** Keep machine stdout parseable when a command fails before it has data to return. */
export declare function writeMachineError(error: unknown): never;
