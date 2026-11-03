/**
 * The plan behind `flisk create`.
 *
 * The wizard asks a few questions; this module turns the answers into what gets built. It does no
 * I/O, so every path is testable.
 *
 * There are two ways to run what it builds:
 *  - **local**: plain processes on your computer. It needs only Node.js: no Docker, no Tilt, no
 *    Postgres. This is the default for a web app or an API, so a first run never waits on tooling.
 *  - **docker**: containers behind one gateway with live reload, for a database, queues, a
 *    framework choice or more parts. It uses the same `flisk project` and `flisk resource`
 *    commands a person would type.
 */
/** What the person is building. A template kind clones or writes a ready-made starter. */
export type CreateKind = "web" | "api" | "saas" | "agent" | "swarm" | "ecommerce";
export type CreateRuntime = "local" | "docker";
export type CreateFrontend = "react" | "vue" | "svelte" | "none";
export type CreateBackend = "hono" | "express" | "fastify" | "elysia";
export type CreateExtra = "queue" | "worker" | "mcp" | "agent" | "redis";
export declare const CREATE_KINDS: readonly CreateKind[];
export declare const CREATE_RUNTIMES: readonly CreateRuntime[];
export declare const CREATE_FRONTENDS: readonly CreateFrontend[];
export declare const CREATE_BACKENDS: readonly CreateBackend[];
export declare const CREATE_EXTRAS: readonly CreateExtra[];
export interface CreateAnswers {
    /** The project folder, kebab-case. */
    name: string;
    kind: CreateKind;
    /** Used by `web` and `api`; the starters decide their own runtime. */
    runtime: CreateRuntime;
    /** Docker runtime and `web` only. */
    frontend: CreateFrontend;
    /** Docker runtime, `web` and `api`. */
    backend: CreateBackend;
    /** Docker runtime, `web` and `api`; a starter already carries its own parts. */
    extras: CreateExtra[];
}
/** The answers a person gets by pressing Enter on every question. */
export declare const CREATE_DEFAULTS: Omit<CreateAnswers, "name">;
/** A file the local runtime writes: a bundled template, JSON, or text. */
export interface LocalFile {
    /** Path inside the project folder. */
    path: string;
    /** A file under cli/templates; `__NAME__` in it becomes the project name. */
    template?: string;
    json?: Record<string, unknown>;
    text?: string;
}
/** One step: a `flisk` invocation (`args`) or a set of files to write (`files`). */
export interface CreateStep {
    /** A short label for the progress line. */
    label: string;
    args?: string[];
    files?: LocalFile[];
    /** Run inside the project folder (true) or in the folder the command was started in (false). */
    inProject: boolean;
}
/** The stack the Docker runtime's generated resources are assigned to. */
export declare const CREATE_STACK = "app";
/** Default ports of a local app; the executor swaps in free ones. */
export interface LocalPorts {
    api: number;
    web: number;
}
export declare const DEFAULT_LOCAL_PORTS: LocalPorts;
/** Returns true when `name` is a usable project folder name. */
export declare function isValidProjectName(name: string): boolean;
/** True for the kinds that start from a ready-made template instead of generated parts. */
export declare function isTemplateKind(kind: CreateKind): boolean;
/** Whether the runtime question applies: only a web app or an API can run either way. */
export declare function asksRuntime(kind: CreateKind): boolean;
/** The framework and extras questions belong to the Docker runtime only. */
export declare function asksFrontend(kind: CreateKind, runtime: CreateRuntime): boolean;
export declare function asksBackend(kind: CreateKind, runtime: CreateRuntime): boolean;
export declare function asksExtras(kind: CreateKind, runtime: CreateRuntime): boolean;
/** True when a project of these answers is built as plain local processes. */
export declare function runsLocally(answers: Pick<CreateAnswers, "kind" | "runtime">): boolean;
/**
 * What builds a project from the answers.
 *
 * A template kind is one `flisk project <template> --path <name>`. The local runtime is one step
 * that writes files. The Docker runtime is `flisk project --yes` followed by one `flisk resource`
 * per part.
 */
export declare function buildCreatePlan(answers: CreateAnswers, ports?: LocalPorts): CreateStep[];
/** What the project needs on the machine, in a sentence. */
export declare function describeRequirements(answers: CreateAnswers): string;
/** The parts the plan creates, for the review summary. */
export declare function describeParts(answers: CreateAnswers, steps: CreateStep[]): string;
/** The answers, one line each, skipping the questions a kind never asks. */
export declare function describeAnswers(answers: CreateAnswers): string[];
/** Parses a comma-separated `--extras` value, naming the first value that is not one of the extras. */
export declare function parseExtras(value: string): {
    extras: CreateExtra[];
} | {
    error: string;
};
