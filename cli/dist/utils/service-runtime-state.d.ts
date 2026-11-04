import type { ServiceRuntimeState } from "../types/index.js";
/**
 * The one answer to "is this service ready?" for `flisk status` and `flisk ui`, from Tilt's resources and the `dependsOn`
 * in service.json. A service whose own process is up is still not ready while something it depends on has failed or
 * is still starting. Services Tilt does not list are absent: the caller shows them as unknown.
 */
export declare function deriveServiceStates(jsonText: string, dependsOn: Record<string, string[]>, deferred?: Set<string>): Record<string, ServiceRuntimeState>;
