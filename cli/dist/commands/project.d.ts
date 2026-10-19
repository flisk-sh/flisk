import { Command } from "commander";
import type { DiscoveredResource } from "../types/index.js";
/**
 * Adds stacks that have service.json files but aren't in any phase to
 * pre_alpha, so a resource scaffolded after `tdk project` is picked up by
 * `tdk up` without re-running `tdk project`. Returns the stacks it enabled.
 */
export declare function enableDiscoveredStacks(projectRoot: string, resources?: DiscoveredResource[]): string[];
export declare const projectCommand: Command;
