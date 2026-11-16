/** Minimum tool versions and the version comparison shared by doctor and preflights. */
export declare const MIN_TILT_VERSION: readonly [0, 25, 0];
export declare const MIN_BUN_VERSION: readonly [1, 2, 0];
export declare function parseVersion(raw: string): number[] | null;
export declare function isAtLeast(version: number[], minimum: readonly number[]): boolean;
export declare function versionMeetsMinimum(raw: string, minimum: readonly number[]): boolean;
