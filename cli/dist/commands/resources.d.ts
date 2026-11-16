import { Command } from "commander";
export interface ListResourcesOptions {
    verbose?: boolean;
    stack?: string | boolean;
    type?: string;
    noStack?: boolean;
    ports?: boolean;
    json?: boolean;
}
export declare function runResourcesList(options: ListResourcesOptions): Promise<void>;
export declare const resourcesCommand: Command;
