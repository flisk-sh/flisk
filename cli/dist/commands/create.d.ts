import { Command } from "commander";
import { type CreateAnswers, type CreateStep, type LocalFile } from "../utils/create-plan.js";
export interface CreateOptions {
    kind?: string;
    runtime?: string;
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
 *
 * The order is what a newcomer needs: what you are building, then how it runs, then (only for the
 * Docker route) the frameworks and extras, and the name last with a default Enter accepts.
 */
export declare function collectAnswers(nameArg: string | undefined, options: CreateOptions, interactive: boolean): Promise<CreateAnswers>;
/** The project folder must not exist, or must be empty, so a create never overwrites anything. */
export declare function assertFolderIsFree(dir: string): void;
/** One line per step for the dry run and the failure report. */
export declare function renderStep(step: CreateStep): string;
/** What gets created, what it needs, and what is chosen, shown before anything is written. */
export declare function reviewLines(answers: CreateAnswers, steps: CreateStep[]): string[];
/** Writes the files of a local step, filling `__NAME__` in templates. Returns the paths written. */
export declare function writeLocalFiles(projectDir: string, name: string, files: LocalFile[]): string[];
/** What to tell someone when a step fails halfway: what finished, what did not, how to start over. */
export declare function recoveryMessage(projectDir: string, steps: CreateStep[], failedIndex: number): string[];
export declare const createCommand: Command;
