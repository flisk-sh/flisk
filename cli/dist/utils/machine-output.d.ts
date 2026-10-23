export declare const SCHEMA_VERSION: 1;
export interface MachineError {
    code: string;
    message: string;
    suggestions?: string[];
}
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
/** Keep machine stdout parseable when a command fails before it has data to return. */
export declare function writeMachineError(error: unknown): never;
