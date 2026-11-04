import { isNativeContainerService } from "./native-container.js";
/**
 * The minimal service contract (openspec/changes/make-flisk-unopinionated, #2227): a service.json that declares a top-level
 * `command` runs as a local process started by `flisk up`, with no image, no Dockerfile and no generated files.
 *
 * ```json
 * { "appName": "api", "appType": "backend", "command": "node server.js", "port": 4000, "env": { "GREETING": "hi" }, "dependsOn": [] }
 * ```
 *
 * `dev.command` is a different field: it is the dev command inside a generated container (see the Python example) and does not
 * make a service native.
 */
/** Container runtime sources. A service has exactly one runtime source, so `command` excludes both. */
const CONTAINER_SOURCE_FIELDS = ["image", "dockerfile"];
/** True when the manifest declares a non-empty top-level `command`. */
export function declaresCommand(manifest) {
    return typeof manifest?.command === "string" && manifest.command.trim() !== "";
}
/** True for a service that runs as a local process (its service.json declares `command`). */
export function isNativeService(resource) {
    return declaresCommand(resource.config);
}
/**
 * Errors in the native part of one service.json: a second runtime source next to `command`, a `command` that is not a string,
 * and an `env` that is not a map of strings. Each error names the service, so a project with many files says which one is wrong.
 * A manifest without `command` returns no errors: the container contract is validated elsewhere and is unchanged.
 */
export function validateNativeServiceFields(manifest) {
    const name = serviceLabel(manifest);
    const errors = [];
    if ("command" in manifest && !declaresCommand(manifest)) {
        errors.push(`service ${name}: command must be a non-empty string`);
    }
    if (!declaresCommand(manifest))
        return errors;
    const conflicting = CONTAINER_SOURCE_FIELDS.filter((field) => manifest[field] !== undefined && manifest[field] !== "");
    if (conflicting.length > 0) {
        errors.push(`service ${name}: declares both command and ${conflicting.join(" and ")}; a service has exactly one runtime source (remove ${conflicting.length === 1 ? "it" : "them"} to run the command locally, or remove command to run in Docker)`);
    }
    const env = manifest.env;
    if (env !== undefined) {
        const isMap = env !== null && typeof env === "object" && !Array.isArray(env);
        const badKeys = isMap
            ? Object.entries(env)
                .filter(([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== "string")
                .map(([key]) => key)
            : [];
        if (!isMap) {
            errors.push(`service ${name}: env must be an object of string values`);
        }
        else if (badKeys.length > 0) {
            errors.push(`service ${name}: env ${badKeys.join(", ")}: names must be letters, digits or _ (not starting with a digit) and values must be strings`);
        }
    }
    return errors;
}
function serviceLabel(manifest) {
    const name = manifest.appName;
    return typeof name === "string" && name ? `"${name}"` : "(unnamed)";
}
/**
 * How `flisk up` runs a selection: natively when every selected service declares `command`, or declares `command` or a
 * ready-made `image` with at least one `command` (a mixed run: the images start with `docker run` next to the local processes),
 * and in containers (Docker + Tilt) when none declares `command`. Any other mix (a service built from a Dockerfile next to a
 * local process), or a container selection in a project that also holds native services (Tilt discovers every service.json,
 * not just the selected ones), cannot run: `mixed` lists the native services in the way.
 */
export function resolveRuntimeMode(selected, all = selected) {
    const native = all.filter(isNativeService).map((resource) => resource.name);
    if (selected.some(isNativeService) &&
        selected.every((resource) => isNativeService(resource) || isNativeContainerService(resource))) {
        return { mode: "native", mixed: [] };
    }
    return { mode: "container", mixed: native };
}
/** The refusal for a selection that mixes native and container services. */
export function formatMixedRuntimeRefusal(nativeNames, containerNames) {
    return [
        `This run mixes services that run as local processes (${nativeNames.join(", ")}) with services that run in Docker (${containerNames.join(", ")}).`,
        "A local-process run can start containers only from a ready-made `image` (a database, a cache); a service built from a Dockerfile cannot join it.",
        "Give the Docker services an `image` instead of a Dockerfile, give every service a `command`, or remove `command` from the local services to run everything in Docker.",
    ].join("\n");
}
/**
 * True when `flisk up` runs a project as local processes, so Compose, Tilt and the gateway are not used: every service declares
 * `command`, or some do and the rest are ready-made `image` containers (a mixed run, which still needs Docker for those). An
 * empty project is not native.
 */
export function isNativeProject(resources) {
    return (resources.some(isNativeService) &&
        resources.every((resource) => isNativeService(resource) || isNativeContainerService(resource)));
}
/** The program a shell command runs first (`node` for `PORT=1 node server.js`), or null when it cannot be told. */
export function commandProgram(command) {
    const words = command.trim().split(/\s+/);
    for (const word of words) {
        // Leading VAR=value assignments set the environment of the program, they are not the program.
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word))
            continue;
        if (word === "exec" || word === "env")
            continue;
        return /^[A-Za-z0-9_./@+-]+$/.test(word) ? word : null;
    }
    return null;
}
