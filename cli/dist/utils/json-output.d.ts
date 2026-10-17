import { type MachineError } from "./machine-output.js";
export type JsonError = MachineError;
export type JsonEmitter = (data: Record<string, unknown>, errors?: JsonError[]) => void;
/**
 * Returns an emitter that writes at most one `{schemaVersion, data, errors}` object to stdout. If the process
 * exits before anything was emitted (a preflight `process.exit`, Tilt ending early), a failure object is written
 * so a JSON consumer never sees an empty stdout. Uses writeSync because `process.exit` does not flush async writes.
 */
export declare function createJsonEmitter(failureCode: string, command: string): JsonEmitter;
