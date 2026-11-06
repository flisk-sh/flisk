import { Command } from "commander";
import { withTrailingSlash } from "../utils/service-urls.js";
export { withTrailingSlash };
export declare function determineDefaultDomain(): string;
export declare function checkServiceStatus(serviceName: string, port?: number, url?: string): Promise<"running" | "stopped" | "unknown">;
export declare const networksCommand: Command;
