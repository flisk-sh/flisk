/**
 * Generated-code lines that declare `name` from PORT: the value when it is a whole
 * number from 1 to 65535, otherwise 3000. Every generated backend uses this one rule,
 * so `PORT=abc` or `PORT=70000` falls back to 3000 instead of becoming NaN.
 */
export declare function portFromEnv(name?: string, indent?: string): string;
