import { Command } from "commander";
export interface FrontendTarget {
    name: string;
    url: string;
}
/** The frontends of the current project, with the URL each one is published under. */
export declare function listFrontendTargets(projectRoot: string): Promise<FrontendTarget[]>;
/** True when the URL answers. A booting frontend needs a moment, so this is asked more than once. */
export declare function isFrontendReady(url: string, timeoutMs?: number): Promise<boolean>;
/** The first frontend that answers, or the first one when none is up yet. */
export declare function pickReadyFrontend(targets: FrontendTarget[], waitMs?: number): Promise<FrontendTarget | undefined>;
/**
 * Opens the first ready frontend of the project in the browser. Returns the URL it opened, or
 * null when the project has no frontend.
 */
export declare function openFirstFrontend(projectRootOverride?: string): Promise<string | null>;
export declare const openCommand: Command;
