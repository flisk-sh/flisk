export interface SearchStatus {
    /** Muted suffix shown after the query, e.g. `2 of 5` or `0 matches`. */
    summary: string;
    /** Empty-state line, set only when nothing matches. */
    emptyMessage?: string;
}
/** Describes a `/` search result for the `flisk ui` header; null when there is no query. */
export declare function describeSearch(query: string, matches: number, total: number): SearchStatus | null;
