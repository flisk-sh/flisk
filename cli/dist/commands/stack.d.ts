import { Command } from "commander";
type StackResourceConfig = {
    [key: string]: unknown;
    appName?: string;
    stack?: string;
};
export declare function parseStackResourceConfig(content: string, configPath: string): StackResourceConfig;
/**
 * What `flisk stack --json` reports: the stacks with their resource counts and the resources without a stack, both as
 * they are after the run, plus the stack this run assigned to (null for --list) and the resources it assigned.
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
}
export declare const stackCommand: Command;
export {};
