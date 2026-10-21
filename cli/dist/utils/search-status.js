/** Describes a `/` search result for the `flisk ui` header; null when there is no query. */
export function describeSearch(query, matches, total) {
    if (!query)
        return null;
    if (matches === 0) {
        return {
            summary: "0 matches",
            emptyMessage: `No resources match "${query}". Press Esc to clear.`,
        };
    }
    return { summary: `${matches} of ${total}` };
}
