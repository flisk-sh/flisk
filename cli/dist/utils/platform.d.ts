export type TdkOs = "linux" | "darwin" | "windows";
export type TdkArch = "amd64" | "arm64";
export declare function isWindows(): boolean;
export declare function tdkOsFor(platformName: string): TdkOs | null;
export declare function tdkOs(): TdkOs | null;
export declare function tdkArchFor(architecture: string): TdkArch | null;
export declare function tdkArch(): TdkArch | null;
export declare function binaryAssetNameFor(platformName: string, architecture: string): string | null;
export declare function binaryAssetName(): string | null;
export declare function executableName(): string;
/** Installs published before the Flisk rename shipped the binary as `tdk`. */
export declare function legacyExecutableName(): string;
export declare function pathLookups(binName: string, windows?: boolean): string[];
export declare function pathDelimiter(windows?: boolean): string;
