import { Command } from "commander";
import { type CompletionCandidates } from "./completion-candidates.js";
declare const SUPPORTED_SHELLS: readonly ["bash", "zsh", "fish", "powershell"];
type SupportedShell = (typeof SUPPORTED_SHELLS)[number];
/** Renders the completion script of one shell. */
export declare function renderCompletionScript(shell: SupportedShell, candidates: CompletionCandidates): string;
export declare const completionCommand: Command;
export {};
