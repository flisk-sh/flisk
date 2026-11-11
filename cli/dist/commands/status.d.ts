import { Command } from "commander";
import type { DiscoveredResource, ServiceRuntimeState } from "../types/index.js";
/**
 * The services `--strict` fails on: the failing or still starting ones. Null when nothing of the project is running (no state
 * at all, or every service with a process of its own is unknown), which `--strict` fails on too. A project with no services
 * has nothing to wait for.
 */
export declare function strictNotReady(resources: readonly Pick<DiscoveredResource, "name" | "type">[], states: Record<string, ServiceRuntimeState> | null): string[] | null;
export declare const statusCommand: Command;
