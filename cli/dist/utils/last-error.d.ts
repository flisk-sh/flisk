export interface ShownError {
    message: string;
    suggestions: string[];
}
/** Remembers the error a command just printed, so a JSON failure object can carry the real reason. */
export declare function rememberShownError(error: ShownError): void;
/** The last error printed with `showError`, or undefined when none was. */
export declare function lastShownError(): ShownError | undefined;
/** Clears the remembered error (tests). */
export declare function forgetShownError(): void;
