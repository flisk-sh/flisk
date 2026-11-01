/**
 * `flisk export render|wrangler|compose`: runs the pinned @flisk-sh/flisk-export, which writes render.yaml, wrangler.toml
 * or a standalone docker-compose.yml from service.json and stops there. It never deploys, never creates DNS records and never calls a cloud API (the
 * export scope agreed in AGENTS.md, "Local-only by default").
 */
import { type SpawnOptions, spawn } from "node:child_process";
import { Command } from "commander";
/**
 * The generators live in their own repo (flisk-sh/flisk-export) so they can ship without a CLI release, and are run
 * from npm at a pinned version so a push to its main branch cannot change what `flisk export` does. Move the pin
 * when a new version is published. `FLISK_EXPORT_PACKAGE` overrides the package spec.
 */
export declare const EXPORT_PACKAGE = "@flisk-sh/flisk-export@0.5.0";
type SpawnFn = (command: string, args: string[], options: SpawnOptions) => ReturnType<typeof spawn>;
export declare function exportInvocation(args: string[], env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform): {
    command: string;
    args: string[];
    shell: boolean;
    pkg: string;
};
/** The extra line printed when the exporter exits non-zero, in case npx could not fetch it at all. */
export declare function unavailableHint(pkg: string, exitCode: number): string;
/** Runs flisk-export with the caller's terminal and resolves to its exit code. */
export declare function runExport(args: string[], spawnFn?: SpawnFn, env?: NodeJS.ProcessEnv): Promise<number>;
/** Every argument goes to flisk-export as given; --dry-run is declared here so it shows in help and is put back. */
export declare function buildForwardedExportArgs(args: string[], options?: {
    dryRun?: boolean;
}): string[];
export declare const exportCommand: Command;
export {};
