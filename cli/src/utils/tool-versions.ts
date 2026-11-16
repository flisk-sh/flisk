/** Minimum tool versions and the version comparison shared by doctor and preflights. */

export const MIN_TILT_VERSION = [0, 25, 0] as const;
export const MIN_BUN_VERSION = [1, 2, 0] as const;

export function parseVersion(raw: string): number[] | null {
  const match = raw.trim().match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

export function isAtLeast(version: number[], minimum: readonly number[]): boolean {
  for (const [index, required] of minimum.entries()) {
    const actual = version[index] ?? 0;
    if (actual !== required) {
      return actual > required;
    }
  }
  return true;
}

export function versionMeetsMinimum(raw: string, minimum: readonly number[]): boolean {
  const version = parseVersion(raw);
  if (!version) return false;
  return isAtLeast(version, minimum);
}
