import { DEFAULT_CAPABILITIES, type PlatformCapability } from "../config/platform-standards.js";
import type { ProjectCapabilities, ProjectConfig } from "../types/index.js";
export { DEFAULT_CAPABILITIES, type PlatformCapability };
export declare function resolveProjectCapabilities(projectRootOrConfig?: string | ProjectConfig | Record<string, unknown> | null, options?: Record<string, unknown>): ProjectCapabilities;
export declare function isDatabaseCapabilityEnabled(projectRootOrConfig?: string | ProjectConfig | Record<string, unknown> | null, options?: Record<string, unknown>): boolean;
export declare function getEnabledCapabilities(projectRootOrConfig?: string | ProjectConfig | Record<string, unknown> | null, options?: Record<string, unknown>): string[];
export declare function getCapabilitiesReport(projectRootOrConfig?: string | ProjectConfig | Record<string, unknown> | null, options?: Record<string, unknown>): Record<string, boolean>;
