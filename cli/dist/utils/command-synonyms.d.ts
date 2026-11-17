/**
 * Common command synonyms or lifecycle verbs that people intuitively try
 * after `flisk up`, mapped to the corresponding Flisk command.
 */
export declare const COMMAND_SYNONYMS: Readonly<Record<string, string>>;
/**
 * Checks if the unknown command error message matches a known synonym
 * and appends a clear recommendation (e.g. `(Did you mean "flisk down"?)`).
 */
export declare function enhanceUnknownCommandError(errorMessage: string): string;
