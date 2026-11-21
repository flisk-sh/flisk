export declare function tiltGetUiResources(port: number): Promise<string | null>;
export declare function tiltResourceLogs(port: number, name: string): Promise<string | null>;
export declare function formatTail(text: string, maxLines?: number): string;
