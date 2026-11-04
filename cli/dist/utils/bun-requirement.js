import { isNativeService } from "./native-service.js";
import { isApiServiceType } from "./resource-kind.js";
/**
 * Bun runs the generated JS services. A project without any has nothing for Bun to run, so neither `flisk doctor` nor
 * `flisk up` needs it. A `command` service runs whatever its command names, so it never needs Bun on Flisk's behalf.
 * Doctor and the start-up preflight share this rule so they cannot disagree.
 */
export function projectNeedsBun(resources) {
    return resources.some((resource) => !isNativeService(resource) &&
        (isApiServiceType(resource.config?.appType) ||
            resource.config?.appType === "frontend" ||
            resource.config?.appType === "worker"));
}
