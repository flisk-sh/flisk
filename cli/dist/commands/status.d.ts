import { Command } from "commander";
import type { DiscoveredResource, ServiceRuntimeState } from "../types/index.js";
/**
 * The services `--strict` fails on: the failing or still starting ones. Null when nothing of the project is running (no state
 * at all, or every service with a process of its own is unknown), which `--strict` fails on too. A project with no services
 * has nothing to wait for. Services with `healthCheck.required: false` whose container/process is running but failing its
 * health check do not fail `--strict`.
 */
export declare function strictNotReady(resources: readonly Pick<DiscoveredResource, "name" | "type" | "config">[], states: Record<string, ServiceRuntimeState> | null): string[] | null;
export declare const statusCommand: Command;
