export declare const UNKNOWN_RESOURCE_CODE: "UNKNOWN_RESOURCE";
export declare function getErrorMessage(err: unknown): string;
export declare function logVerbose(message: string, err?: unknown): void;
export declare class FliskError extends Error {
    suggestions: string[];
    exitCode: number;
    constructor(message: string, suggestions?: string[], exitCode?: number);
    display(): void;
    /** Display this error and exit the process with its exit code. */
    exit(): never;
}
export declare function unknownResourceSuggestions(name: string, validNames?: readonly string[]): string[];
export declare class UnknownResourceError extends FliskError {
    readonly code: "UNKNOWN_RESOURCE";
    constructor(name: string, suggestions: string[]);
}
export declare class NotInProjectError extends FliskError {
    readonly code: "NOT_IN_PROJECT";
    constructor(message?: string, suggestions?: string[], exitCode?: number);
}
export declare class ResourceNotFoundError extends FliskError {
    readonly code: "RESOURCE_NOT_FOUND";
    constructor(name: string, resourceNames?: readonly string[], suggestions?: string[]);
}
export declare class StackNotFoundError extends FliskError {
    readonly code: "STACK_NOT_FOUND";
    constructor(name: string, stackNames?: readonly string[], suggestions?: string[]);
}
export declare class ConfigInvalidError extends FliskError {
    readonly code: "CONFIG_INVALID";
    constructor(message: string, suggestions?: string[], exitCode?: number);
}
export declare class DirectoryExistsError extends FliskError {
    readonly code: "DIRECTORY_EXISTS";
    constructor(path: string, suggestions?: string[]);
}
export declare class InvalidPathError extends FliskError {
    readonly code: "INVALID_PATH";
    constructor(path: string, suggestions?: string[]);
}
export declare class NoResourcesError extends FliskError {
    readonly code: "NO_RESOURCES";
    constructor(message?: string, suggestions?: string[], exitCode?: number);
}
export declare class TiltNotInstalledError extends FliskError {
    readonly code: "TILT_NOT_INSTALLED";
    constructor(message?: string, suggestions?: string[]);
}
export declare class DockerNotAvailableError extends FliskError {
    readonly code: "DOCKER_NOT_AVAILABLE";
    constructor(message?: string, suggestions?: string[]);
}
export declare class DockerNotRespondingError extends FliskError {
    readonly code: "DOCKER_NOT_RESPONDING";
    constructor(message?: string, suggestions?: string[]);
}
export declare class UnknownServicesError extends FliskError {
    readonly code: "UNKNOWN_SERVICES";
    constructor(names: readonly string[], validNames: readonly string[]);
}
export declare class InteractiveTerminalRequiredError extends FliskError {
    readonly code: "INTERACTIVE_TERMINAL_REQUIRED";
    constructor(commandName?: string, suggestions?: string[]);
}
/**
 * Thrown by the `process.exit` test double so the stack unwinds at an intentional exit.
 * `runCommand` rethrows it instead of formatting it as a command failure.
 */
export declare class ProcessExitError extends Error {
    readonly code: number;
    constructor(code?: number);
}
export declare const errorFactories: {
    tiltNotInstalled: () => TiltNotInstalledError;
    dockerNotAvailable: () => DockerNotAvailableError;
    dockerNotResponding: () => DockerNotRespondingError;
    stackNotFound: (name: string, stackNames?: readonly string[]) => StackNotFoundError;
    resourceNotFound: (name: string, resourceNames?: readonly string[]) => ResourceNotFoundError;
    unknownResource: (name: string, validNames?: readonly string[]) => UnknownResourceError;
    unknownServices: (names: readonly string[], validNames: readonly string[]) => UnknownServicesError;
    directoryExists: (path: string) => DirectoryExistsError;
    invalidPath: (path: string) => InvalidPathError;
    notInProject: () => NotInProjectError;
    noResources: () => NoResourcesError;
    interactiveTerminalRequired: (commandName?: string) => InteractiveTerminalRequiredError;
};
export declare function requireProjectRoot(): string;
/**
 * Resolves the project root before a command mutates or probes Docker on the machine (#4282).
 * Exits with the not-in-project error when `resolveRoot` returns null.
 */
export declare function requireProjectBeforeDocker(resolveRoot?: () => string | null, onNotInProject?: (error: FliskError) => never): string;
/** Prints a command failure the way every command does (a FliskError with its suggestions, anything else as one error line) and exits 1. */
export declare function handleCommandError(err: unknown): never;
export declare function runCommand<T>(action: () => Promise<T>, options?: {
    verbose?: boolean;
}): Promise<T | never>;
export declare function withTiltCheck<T>(action: () => Promise<T>, options?: {
    verbose?: boolean;
}): Promise<T | never>;
export declare function showErrorAndExit(message: string, exitCode?: number, suggestions?: string[]): never;
/** Display a formatted error message. Does NOT exit. */
export declare function showError(message: string, context?: string, suggestions?: string[]): void;
export declare function handleTiltFailure(command: "up" | "down", exitCode: number): never;
