import { Command } from "commander";
/** `/api/vote` → `/api/vote/`: the URL a browser should open for a page served under a stripped prefix. */
export declare function withTrailingSlash(path: string): string;
export declare function determineDefaultDomain(): string;
export declare function checkServiceStatus(serviceName: string, port?: number, url?: string): Promise<"running" | "stopped" | "unknown">;
export declare const networksCommand: Command;
