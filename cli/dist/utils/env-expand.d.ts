/**
 * Expands `${VAR}` and `${VAR:-default}` from `vars`. An unknown variable without a default becomes an empty string, the way a
 * shell expands it, and is reported through `onMissing` so `flisk up` can say which one.
 */
export declare function expandEnvValue(value: string, vars: Readonly<Record<string, string | undefined>>, onMissing?: (name: string) => void): string;
