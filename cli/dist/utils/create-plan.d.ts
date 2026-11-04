export type CreateRuntime = "local" | "docker";
export declare const CREATE_RUNTIMES: readonly CreateRuntime[];
/** The API of an app: a language, and for a language that takes frameworks, the framework. */
export interface BackendChoice {
    language: string;
    framework?: string;
}
export interface CreateAnswers {
    /** The project folder, kebab-case. */
    name: string;
    /** A project template key. When set, the app answers below are not used: the template carries its own parts. */
    starter?: string;
    runtime: CreateRuntime;
    /** A frontend framework id, or undefined for no website. */
    frontend?: string;
    /** The API, or undefined for none. */
    backend?: BackendChoice;
    /** Docker route only: ids from the extras catalog. */
    extras: string[];
}
/** One real Flisk command: the arguments after `flisk`, and where it runs. */
export interface CreateStep {
    /** A short label for the progress line. */
    label: string;
    args: string[];
    /** Run inside the project folder (true) or in the folder `create` was started in (false). */
    inProject: boolean;
}
/** The stack the Docker route assigns its resources to. */
export declare const CREATE_STACK = "app";
/** The folders a local project's website and API live in. */
export declare const LOCAL_FRONTEND_DIR = "web";
export declare const LOCAL_BACKEND_DIR = "api";
/** Returns true when `name` is a usable project folder name. */
export declare function isValidProjectName(name: string): boolean;
/**
 * The commands that build the project.
 *
 * A starter is one `flisk project <template>`. An app is `flisk project --yes` and one `flisk resource` per part: the API
 * first (a website is wired to the API already in its stack), then the website, then any extras.
 */
export declare function buildCreatePlan(answers: CreateAnswers): CreateStep[];
/** True when the plan builds nothing: no starter, no website and no API. */
export declare function isEmptyApp(answers: CreateAnswers): boolean;
/** What the project needs on the machine, in a sentence. Starter requirements come from the starter itself. */
export declare function describeRequirements(answers: CreateAnswers, onPath?: (program: string) => boolean): string;
/** The parts the plan creates, for the review. */
export declare function describeParts(answers: CreateAnswers, steps: CreateStep[]): string;
/** The answers, one line each, skipping what was not chosen. */
export declare function describeAnswers(answers: CreateAnswers): string[];
