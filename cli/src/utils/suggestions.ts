// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Every cell is written before it is read, so the fallback never changes the result.
function cell(row: readonly number[], index: number): number {
  return row[index] ?? 0;
}

function levenshteinDistance(left: string, right: string): number {
  let previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const currentRow = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      currentRow[rightIndex] = Math.min(
        cell(currentRow, rightIndex - 1) + 1,
        cell(previousRow, rightIndex) + 1,
        cell(previousRow, rightIndex - 1) + substitutionCost,
      );
    }
    previousRow = currentRow;
  }

  return cell(previousRow, right.length);
}

function isAdjacentTransposition(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length - 1; index++) {
    if (
      left[index] !== right[index] &&
      left[index] === right[index + 1] &&
      left[index + 1] === right[index] &&
      left.slice(0, index) === right.slice(0, index) &&
      left.slice(index + 2) === right.slice(index + 2)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Bases the threshold on the longer name and caps it at two edits.
 * An adjacent transposition counts as one typo; ties use deterministic code-unit order.
 */
export function suggestClosest(input: string, candidates: readonly string[]): string | undefined {
  if (input.length < 2 || candidates.length === 0) return undefined;
  // stackExists and findUnknownServices are case-sensitive, so case-only mismatches need the canonical spelling.
  if (candidates.includes(input)) return undefined;

  const normalizedInput = input.toLowerCase();
  let closest: string | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate.length === 0) continue;
    const normalizedCandidate = candidate.toLowerCase();
    const distance = isAdjacentTransposition(normalizedInput, normalizedCandidate)
      ? 1
      : levenshteinDistance(normalizedInput, normalizedCandidate);
    const threshold = Math.max(
      1,
      Math.min(2, Math.floor(Math.max(normalizedInput.length, normalizedCandidate.length) / 3)),
    );
    if (distance > threshold) continue;

    if (
      distance < closestDistance ||
      (distance === closestDistance && (closest === undefined || candidate < closest))
    ) {
      closest = candidate;
      closestDistance = distance;
    }
  }

  return closest;
}
