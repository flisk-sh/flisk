import { spawn } from "node:child_process";
import { type StackOutcome } from "./one-command.js";
/**
 * `flisk demo` without Docker: when Docker or Tilt is not ready (or on native Windows, or with `--no-docker`), the demo writes a
 * small two-service app (a menu API and a website) from the CLI package's templates and starts it as local processes. It needs
 * only Node, no git clone, no Bun and no network, so the first command a new user runs ends in a working page.
 */
/** The demo folder under ~/.flisk, next to the Docker demo's flisk-demo. */
export declare const NATIVE_DEMO_DIR = "flisk-demo-native";
/** Forces the demo without Docker even when Docker and Tilt are ready. Not in the help: the demo picks it by itself. */
export declare const NO_DOCKER_FLAG = "--no-docker";
export interface DemoPorts {
    api: number;
    web: number;
}
/** What the container check runs, injectable so the decision is testable without Docker. */
export interface ContainerProbe {
    onPath(command: string): string | null;
    succeeds(command: string, args: string[]): Promise<boolean>;
}
/** Why the Docker + Tilt demo cannot run here, or null when Docker is running and Compose and Tilt are installed. */
export declare function containerDemoProblem(probe?: ContainerProbe): Promise<string | null>;
/**
 * Why `flisk demo` runs without Docker, or null for the full Docker + Tilt demo. The flag and the platform are decided before
 * Docker is probed, so `--no-docker` and native Windows never wait on `docker info`.
 */
export declare function nativeDemoReason(input: {
    argv: readonly string[];
    platform: string;
    env: NodeJS.ProcessEnv;
    probe?: ContainerProbe;
}): Promise<string | null>;
/** The first port from `start` that nothing listens on. */
export declare function findFreePort(start: number, isTaken?: (port: number) => Promise<boolean>, exclude?: readonly number[], attempts?: number): Promise<number>;
/** Free ports for the two services, starting from 4000 for the API and 3000 for the website. */
export declare function pickDemoPorts(isTaken?: (port: number) => Promise<boolean>): Promise<DemoPorts>;
/** The service.json of each service, keyed by its path in the demo folder. */
export declare function nativeDemoManifests(ports: DemoPorts): Record<string, Record<string, unknown>>;
/** True when `dir` is a folder this demo wrote. */
export declare function isNativeDemoFolder(dir: string): boolean;
/** True when `dir` may receive the demo: it is missing, empty, or a demo folder from an earlier run. */
export declare function canWriteNativeDemo(dir: string): boolean;
/** Writes the app and its service.json files. A rerun rewrites them, so the ports follow what is free now. */
export declare function writeNativeDemo(dir: string, ports: DemoPorts, readTemplate?: (name: string) => string): void;
/** The website URL of a demo that is still running in `dir`, or null. */
export declare function runningNativeDemoUrl(dir: string): string | null;
/**
 * Starts `flisk up --json` in the demo folder as a detached process whose output goes to `logPath`, and resolves with the
 * envelope it prints once both services answer. The process supervises the services after this command exits, until
 * `flisk down`.
 */
export declare function startNativeDemo(binPath: string, dir: string, logPath: string, options?: {
    timeoutMs?: number;
    spawnFn?: typeof spawn;
    pollMs?: number;
}): Promise<StackOutcome>;
export interface NativeDemoInput {
    destination: string;
    binPath: string;
    /** Why the demo runs without Docker, printed before it starts. */
    reason: string;
    version: string;
    open?: (url: string) => Promise<boolean>;
}
/** The whole demo without Docker. Returns the exit code. */
export declare function runNativeDemo(input: NativeDemoInput): Promise<number>;
