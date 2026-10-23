import { Command } from "commander";
import type { DiscoveredResource } from "../types/index.js";
/**
 * Adds stacks that have service.json files but aren't in any phase to
 * pre_alpha, so a resource scaffolded after `flisk project` is picked up by
 * `flisk up` without re-running `flisk project`. Returns the stacks it enabled.
 */
export declare function enableDiscoveredStacks(projectRoot: string, resources?: DiscoveredResource[]): string[];
/** The directory a template lands in: the requested path, or the template's repository name. */
export declare function templateTargetDir(templateName: string, targetDir?: string): string;
export declare function cloneProjectTemplate(templateName: string, targetDir: string | undefined, runtimeNextSteps: string[], options?: {
    quiet?: boolean;
}): Promise<void>;
export declare const projectCommand: Command;
