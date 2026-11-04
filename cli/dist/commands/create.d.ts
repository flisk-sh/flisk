import { Command } from "commander";
import { type CreateAnswers, type CreateStep } from "../utils/create-plan.js";
export interface CreateOptions {
    starter?: string;
    runtime?: string;
    frontend?: string;
    backend?: string;
    language?: string;
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
 * Collects the answers. A flag wins over a question, and a question is only asked for a part the chosen shape uses. Without a
 * terminal the registries' defaults fill what a flag did not.
 */
export declare function collectAnswers(nameArg: string | undefined, options: CreateOptions, interactive: boolean): Promise<CreateAnswers>;
/** The project folder must not exist, or must be empty, so a create never overwrites anything. */
export declare function assertFolderIsFree(dir: string): void;
/**
 * Claim the project folder right before anything is written. The earlier check ran before the
 * confirmation, so this re-checks it and creates the folder without `recursive` on the last
 * segment: if another process made it in the meantime, mkdir fails (EEXIST) and create aborts
 * instead of writing into a folder it no longer owns.
 */
export declare function claimFolder(dir: string): void;
/** One line per step for the dry run and the failure report. */
export declare function renderStep(step: CreateStep): string;
/** What gets created, what it needs, and what was chosen, shown before anything is written. */
export declare function reviewLines(answers: CreateAnswers, steps: CreateStep[], onPath?: (program: string) => boolean): string[];
/** A service `flisk resource --local` wrote: where it lives, how to install it, and how it starts. */
export interface GeneratedService {
    dir: string;
    /** The install command, or the generator's own hint for a language without a package.json. */
    install?: string;
    run: string;
}
/** The local services a project actually contains, read from the files the generators wrote. */
export declare function generatedServices(projectDir: string, answers: CreateAnswers): GeneratedService[];
/** The commands to run next, from what was generated. */
export declare function nextSteps(projectDir: string, answers: CreateAnswers, services?: GeneratedService[]): string[];
/** What to tell someone when a step fails halfway: what finished, what did not run, how to start over. */
export declare function recoveryMessage(projectDir: string, steps: CreateStep[], failedIndex: number): string[];
export declare const createCommand: Command;
