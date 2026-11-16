/**
 * Deduplicates non-empty candidate names and orders them by edit distance to `input`
 * (adjacent transpositions count as one edit; ties use deterministic code-unit order).
 */
export declare function rankByDistance(input: string, candidates: readonly string[]): string[];
/**
 * Bases the threshold on the longer name and caps it at two edits.
 * An adjacent transposition counts as one typo; ties use deterministic code-unit order.
 */
export declare function suggestClosest(input: string, candidates: readonly string[]): string | undefined;
