import { Command } from "commander";
import { type CompletionCandidates } from "./completion-candidates.js";
import { type SupportedShell } from "./completion-shells.js";
/** Renders the completion script of one shell. */
export declare function renderCompletionScript(shell: SupportedShell, candidates: CompletionCandidates): string;
export declare const completionCommand: Command;
