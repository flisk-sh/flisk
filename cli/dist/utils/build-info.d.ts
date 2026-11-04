export interface BuildInfo {
    commit: string;
    commitSha?: string;
    version?: string;
    [key: string]: unknown;
}
export declare function clearBuildInfoCache(): void;
export declare function getBuildInfo(customPath?: string): BuildInfo | null;
export declare function getBuildCommit(customPath?: string): string;
