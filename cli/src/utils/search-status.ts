// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
export interface SearchStatus {
  /** Muted suffix shown after the query, e.g. `2 of 5` or `0 matches`. */
  summary: string;
  /** Empty-state line, set only when nothing matches. */
  emptyMessage?: string;
}

/** Describes a `/` search result for the `flisk ui` header; null when there is no query. */
export function describeSearch(query: string, matches: number, total: number): SearchStatus | null {
  if (!query) return null;
  if (matches === 0) {
    return {
      summary: "0 matches",
      emptyMessage: `No resources match "${query}". Press Esc to clear.`,
    };
  }
  return { summary: `${matches} of ${total}` };
}
