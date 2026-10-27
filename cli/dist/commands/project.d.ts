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
/** Clones (or copies) a starter template and resolves to the absolute directory it landed in. */
export declare function cloneProjectTemplate(templateName: string, targetDir: string | undefined, runtimeNextSteps: string[], options?: {
    quiet?: boolean;
}): Promise<string>;
/**
 * Writes .flisk/project.json with the defaults `flisk project --yes` uses, and nothing else: no generated Tiltfile, Compose file,
 * .env or engine copy. `flisk up` uses it to adopt a directory of `command` services as a project, so `flisk down` and
 * `flisk doctor` find it afterwards.
 */
export declare function writeDefaultProjectConfig(projectRoot: string): void;
export declare const projectCommand: Command;
