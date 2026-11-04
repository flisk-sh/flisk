import type { JsonCommandResult, MachineError } from "../types/index.js";
import { FliskError } from "./errors.js";
/** A command failure with a machine code more precise than COMMAND_FAILED, such as IMPORT_FAILED. */
export declare class JsonCommandError extends FliskError {
    readonly code: string;
    constructor(code: string, message: string, suggestions?: string[], exitCode?: number);
}
/**
 * The message and suggestions of a failure that a deeper `showError` printed before it exited: its "❌" line and its
 * "→" lines. Without a "❌" line the other printed lines are the message, and without any the fallback is.
 */
export declare function failureFromStderr(text: string, fallback: string): Pick<MachineError, "message" | "suggestions">;
/**
 * Runs a command's action for `--json`. While it runs, colour is off and everything a person would read
 * (`console.log`, `console.info`, `console.debug`, `process.stdout.write`) goes to stderr, so stdout carries exactly one
 * envelope: the action's `data` on success, or `data: null` and one error on failure. A thrown FliskError becomes
 * COMMAND_FAILED with its suggestions (a JsonCommandError keeps its own code), anything else INTERNAL (exit 2). A
 * `process.exit` from deeper code becomes `failureCode`, with the message that code printed through `showError`.
 */
export declare function runJsonCommand(failureCode: string, command: string, action: () => Promise<JsonCommandResult>): Promise<void>;
