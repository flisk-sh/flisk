export type FliskOs = "linux" | "darwin" | "windows";
export type FliskArch = "amd64" | "arm64";
export declare function isWindows(): boolean;
export declare function fliskOsFor(platformName: string): FliskOs | null;
export declare function fliskOs(): FliskOs | null;
export declare function fliskArchFor(architecture: string): FliskArch | null;
export declare function fliskArch(): FliskArch | null;
export declare function binaryAssetNameFor(platformName: string, architecture: string): string | null;
export declare function binaryAssetName(): string | null;
export declare function executableName(): string;
export declare function pathLookups(binName: string, windows?: boolean): string[];
export declare function pathDelimiter(windows?: boolean): string;
/** Where Flisk is running, for advice that differs by host: native Windows, WSL2, Linux or macOS. */
export type PlatformKind = "windows" | "wsl2" | "linux" | "macos" | "other";
export interface PlatformProbe {
    platform?: string;
    env?: Record<string, string | undefined>;
    /** The kernel release string (`os.release()`); WSL2 kernels contain "microsoft". */
    release?: string;
}
/** True inside a WSL distribution (Linux kernel running under Windows). */
export declare function isWsl(probe?: PlatformProbe): boolean;
export declare function detectPlatformKind(probe?: PlatformProbe): PlatformKind;
