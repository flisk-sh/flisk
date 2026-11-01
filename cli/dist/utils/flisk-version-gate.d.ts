export interface FliskVersionGateOptions {
    ignoreVersion?: boolean;
    json?: boolean;
    onFail?: (message: string) => void;
}
/**
 * Rejects commands when the running CLI does not satisfy the project's
 * version requirements. Use the same gate across every version-gated command.
 */
export declare function enforceFliskVersionGate(projectRoot: string, options?: FliskVersionGateOptions, currentVersion?: string, exit?: (code: number) => never): void;
