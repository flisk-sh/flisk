import type { McpCheckOptions, McpCheckReport, McpTransport } from "./types.js";
export declare function runMcpCheck(url: string, options?: McpCheckOptions): Promise<McpCheckReport>;
export declare function runChecks(probe: McpTransport, url: string, options?: McpCheckOptions): Promise<McpCheckReport>;
