import { Command } from "commander";
type StackResourceConfig = {
    [key: string]: unknown;
    appName?: string;
    stack?: string;
};
export declare function parseStackResourceConfig(content: string, configPath: string): StackResourceConfig;
export declare function normalizeResourceNames(names: string[]): string[];
/**
 * What `flisk stack --json` reports: the stacks with their resource counts and the resources without a stack, both as
 * they are after the run, plus the target stack (null for --list/--remove) and the resources assigned or removed.
 */
export interface StackReport {
    stacks: {
        name: string;
        resourceCount: number;
    }[];
    unassigned: {
        name: string;
        configPath: string;
    }[];
    stack: string | null;
    assigned: {
        name: string;
        configPath: string;
    }[];
    removed?: {
        name: string;
        configPath: string;
    }[];
}
export declare const stackCommand: Command;
export {};
