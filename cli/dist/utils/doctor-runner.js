import { CONTAINER_RUNTIME_CHECK } from "./constants.js";
import { timeDoctorCheck } from "./doctor-report.js";
/** Failures are shown before passing statuses, with a 5432 conflict first. */
export function orderDoctorResults(results) {
    const failures = results.filter((result) => !result.didPass && !result.isSkipped && !result.isWarning);
    const remaining = results.filter((result) => result.didPass || result.isSkipped || result.isWarning);
    failures.sort((left, right) => {
        const rank = (result) => {
            if (result.name === "Host Ports" && /\b5432\b/.test(result.message))
                return 0;
            if (result.name === "Host Ports")
                return 1;
            if (result.name === "Ingress Ports")
                return 2;
            return 3;
        };
        return rank(left) - rank(right);
    });
    return [...failures, ...remaining];
}
export function getDoctorOutcomeMessage(inProject, allPassed) {
    if (!allPassed)
        return "Doctor failed. Fix the items above, then run: flisk doctor";
    return inProject ? "Doctor passed. Next: flisk up" : "Doctor passed. Next: flisk project example";
}
export const CONTAINER_CHECK_NAMES_MAP = {
    checkDockerOperatingSystem: "Docker OS",
    checkDockerCompose: "Docker Compose",
    checkDockerVersions: "Docker Versions",
    checkDockerNetworkCapacity: "Docker Network Pool",
    checkContainerResourceHealth: "Container Resource Health",
    checkCrashLoopingContainers: "Crash-looping containers",
    checkTiltResourceHealth: "Tilt Resources",
    checkServiceHealth: "Service Health",
    checkServiceSmoke: "Service Smoke",
    checkAdvertisedEndpoints: "Advertised Endpoints",
    checkDockerBuildCache: "Docker Build Cache",
    checkDockerFileSharing: "Docker File Sharing",
    checkExternalComposeNetworks: "External compose networks",
};
export const CONTAINER_DEPENDENT_CHECK_NAMES = new Set([
    "Docker OS",
    "Docker Compose",
    "Docker Versions",
    "Docker Network Pool",
    "Container Resource Health",
    "Crash-looping containers",
    "Tilt Resources",
    "Service Health",
    "Service Smoke",
    "Advertised Endpoints",
    "Docker Build Cache",
    "Colima Disk",
    "Docker File Sharing",
    "External compose networks",
    ...Object.keys(CONTAINER_CHECK_NAMES_MAP),
]);
export function isContainerDependentCheck(check) {
    if (check.requiresContainerRuntime)
        return true;
    if (check.checkName && CONTAINER_DEPENDENT_CHECK_NAMES.has(check.checkName))
        return true;
    if (check.name && CONTAINER_DEPENDENT_CHECK_NAMES.has(check.name))
        return true;
    return false;
}
export function requiresContainerRuntime(checkName, check) {
    const wrapped = () => check();
    wrapped.requiresContainerRuntime = true;
    wrapped.checkName = checkName;
    return wrapped;
}
export async function runChecks(checks, options = {}) {
    const results = [];
    let containerRuntimeFailed = Boolean(options.containerRuntimeFailed);
    for (const check of checks) {
        if (containerRuntimeFailed && isContainerDependentCheck(check)) {
            let checkName = check.checkName;
            if (checkName === undefined) {
                const mappedName = check.name ? CONTAINER_CHECK_NAMES_MAP[check.name] : undefined;
                if (mappedName) {
                    checkName = mappedName;
                }
                else if (check.name && check.name !== "check" && check.name !== "fn") {
                    checkName = check.name;
                }
                else {
                    checkName = "Container check";
                }
            }
            results.push({
                name: checkName,
                didPass: true,
                isSkipped: true,
                message: `Docker not running - skipped ${checkName} check`,
            });
            continue;
        }
        const result = await timeDoctorCheck(check);
        results.push(result);
        if (result.name === CONTAINER_RUNTIME_CHECK && !result.didPass) {
            containerRuntimeFailed = true;
        }
        if (!options.all && !result.didPass && !result.isSkipped && !result.isWarning) {
            break;
        }
    }
    return results;
}
export function formatDoctorSummary(results) {
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let warned = 0;
    for (const result of results) {
        if (result.isSkipped) {
            skipped++;
        }
        else if (result.isWarning) {
            warned++;
        }
        else if (result.didPass) {
            passed++;
        }
        else {
            failed++;
        }
    }
    if (warned > 0) {
        return `${passed} passed, ${warned} warned, ${failed} failed, ${skipped} skipped`;
    }
    return `${passed} passed, ${failed} failed, ${skipped} skipped`;
}
