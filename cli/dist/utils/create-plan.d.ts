/**
 * The plan behind `flisk create`.
 *
 * The wizard asks a few questions; this module turns the answers into the exact `flisk` commands
 * that build the project. It does no I/O, so every path is testable, and it only emits commands the
 * CLI already has (`flisk project`, `flisk resource`), so a created project is the same one a person
 * would get by typing them.
 */
/** What the person is building. A template kind clones or writes a ready-made starter. */
export type CreateKind = "web" | "api" | "saas" | "agent" | "swarm" | "ecommerce";
export type CreateFrontend = "react" | "vue" | "svelte" | "none";
export type CreateBackend = "hono" | "express" | "fastify" | "elysia";
export type CreateExtra = "queue" | "worker" | "mcp" | "agent" | "redis";
export declare const CREATE_KINDS: readonly CreateKind[];
export declare const CREATE_FRONTENDS: readonly CreateFrontend[];
export declare const CREATE_BACKENDS: readonly CreateBackend[];
export declare const CREATE_EXTRAS: readonly CreateExtra[];
export interface CreateAnswers {
    /** The project folder, kebab-case. */
    name: string;
    kind: CreateKind;
    /** Used by `web` only. */
    frontend: CreateFrontend;
    /** Used by `web` and `api`. */
    backend: CreateBackend;
    /** Used by `web` and `api`; a template already carries its own parts. */
    extras: CreateExtra[];
}
/** The answers a person gets by pressing Enter on every question. */
export declare const CREATE_DEFAULTS: Omit<CreateAnswers, "name">;
/** One `flisk` invocation: the arguments after `flisk`, and where it runs. */
export interface CreateStep {
    /** A short label for the progress line. */
    label: string;
    args: string[];
    /** Run inside the project folder (true) or in the folder the command was started in (false). */
    inProject: boolean;
}
/** The stack the generated resources are assigned to. */
export declare const CREATE_STACK = "app";
/** Returns true when `name` is a usable project folder name. */
export declare function isValidProjectName(name: string): boolean;
/** True for the kinds that start from a ready-made template instead of generated resources. */
export declare function isTemplateKind(kind: CreateKind): boolean;
/** Whether the frontend and backend questions apply to a kind. */
export declare function asksFrontend(kind: CreateKind): boolean;
export declare function asksBackend(kind: CreateKind): boolean;
export declare function asksExtras(kind: CreateKind): boolean;
/**
 * The commands that build a project from the answers.
 *
 * A template kind is one `flisk project <template> --path <name>` (the template ships its own
 * services). A generated kind is `flisk project --yes` followed by one `flisk resource` per part.
 */
export declare function buildCreatePlan(answers: CreateAnswers): CreateStep[];
/** The questions a kind skips, so the summary does not claim a choice the person never made. */
export declare function describeAnswers(answers: CreateAnswers): string[];
/** Parses a comma-separated `--extras` value, naming the first value that is not one of the extras. */
export declare function parseExtras(value: string): {
    extras: CreateExtra[];
} | {
    error: string;
};
