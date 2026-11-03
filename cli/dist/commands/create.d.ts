import { Command } from "commander";
import { type CreateAnswers } from "../utils/create-plan.js";
export interface CreateOptions {
    kind?: string;
    frontend?: string;
    backend?: string;
    extras?: string;
    yes?: boolean;
    dryRun?: boolean;
    start?: boolean;
}
/** Whether the command may ask questions: a terminal on both ends, and no `--yes`. */
export declare function isInteractive(options: CreateOptions, tty: {
    in: boolean;
    out: boolean;
}): boolean;
/**
 * Collects the answers. A flag wins over a question, and a question is only asked for a part the
 * chosen kind uses. Without a terminal the defaults fill what a flag did not.
 */
export declare function collectAnswers(nameArg: string | undefined, options: CreateOptions, interactive: boolean): Promise<CreateAnswers>;
/** The project folder must not exist, or must be empty, so a create never overwrites anything. */
export declare function assertFolderIsFree(dir: string): void;
export declare const createCommand: Command;
