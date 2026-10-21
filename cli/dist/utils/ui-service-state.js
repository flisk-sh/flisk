import { getDeferredResourceNames } from "./doctor-runtime.js";
import { deriveServiceStates } from "./service-runtime-state.js";
import { deriveStackStatus } from "./stack-status.js";
import { tiltGetUiResources } from "./up-readiness.js";
/** One look at the running Tilt. Empty when no Tilt answers, so every service stays unknown. */
export async function fetchServiceStates(services, tiltPort) {
    try {
        const text = await tiltGetUiResources(tiltPort);
        if (!text)
            return {};
        return deriveServiceStates(text, Object.fromEntries(services.map((r) => [r.name, r.config?.dependsOn ?? []])), getDeferredResourceNames());
    }
    catch {
        return {};
    }
}
/** The same states `flisk status` shows, put onto the stack the UI is about to draw. */
export function applyServiceStates(metadata, states) {
    const resources = metadata.resources.map((resource) => {
        const state = states[resource.name];
        if (!state)
            return resource;
        return {
            ...resource,
            status: state.status,
            ...(state.reason ? { statusReason: state.reason } : {}),
        };
    });
    return {
        ...metadata,
        resources,
        overallStatus: deriveStackStatus(resources.map((r) => r.status)),
    };
}
