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
/**
 * Thrown by the `process.exit` test double so the stack unwinds at an intentional exit.
 * `runCommand` rethrows it instead of formatting it as a command failure.
 */
export declare class ProcessExitError extends Error {
    readonly code: number;
    constructor(code?: number);
}
export declare const errorFactories: {
    tiltNotInstalled: () => FliskError;
    dockerNotAvailable: () => FliskError;
    dockerNotResponding: () => FliskError;
    stackNotFound: (name: string, stackNames?: readonly string[]) => FliskError;
    resourceNotFound: (name: string, resourceNames?: readonly string[]) => FliskError;
    unknownServices: (names: readonly string[], validNames: readonly string[]) => FliskError;
    directoryExists: (path: string) => FliskError;
    invalidPath: (path: string) => FliskError;
    notInProject: () => FliskError;
};
export declare function requireProjectRoot(): string;
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
