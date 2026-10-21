import type { ResourceStatus } from "../types/index.js";
export interface ServiceRuntimeState {
    status: ResourceStatus;
    /** Why the service is not ready: its own error, or the dependency that failed or is still starting. */
    reason?: string;
    /** Failed services this one depends on, directly or through others. */
    blockedBy?: string[];
}
/**
 * The one answer to "is this service ready?" for `flisk status` and `flisk ui`, from Tilt's resources and the `dependsOn`
 * in service.json. A service whose own process is up is still not ready while something it depends on has failed or
 * is still starting. Services Tilt does not list are absent: the caller shows them as unknown.
 */
export declare function deriveServiceStates(jsonText: string, dependsOn: Record<string, string[]>, deferred?: Set<string>): Record<string, ServiceRuntimeState>;
