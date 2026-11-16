import type { CheckResult } from "../types/index.js";
import { checkDockerBuildCache } from "./docker-build-cache.js";
import { checkDockerFileSharing } from "./docker-file-sharing.js";
import { checkStarlarkLoadExports } from "./doctor-starlark.js";
import { checkPublicEnvSecrets } from "./public-env-secrets.js";
export { checkIngressPorts, checkPrivateNpmRegistry, checkTiltResourceHealth, summarizeServiceProbes, summarizeTiltBuildError, } from "./doctor-runtime.js";
export { checkDockerBuildCache, checkDockerFileSharing, checkPublicEnvSecrets, checkStarlarkLoadExports, };
/**
 * Tilt only builds resources under `discovery.paths`, but the CLI finds every service.json,
 * so a resource outside them is listed and given a URL by `flisk up` yet never started.
 */
export declare function checkResourceDiscovery(): CheckResult;
export declare function checkGeneratedFiles(strict?: boolean): CheckResult;
export declare function checkGeneratedProjectRuntimeAssets(): CheckResult;
export declare function checkStartupScripts(): CheckResult;
export declare function checkTypeScriptTypeDependencies(): CheckResult;
export declare function checkFrontendDockerPreflight(): CheckResult;
