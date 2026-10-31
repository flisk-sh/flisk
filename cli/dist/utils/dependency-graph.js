/**
 * The one place that turns service.json `dependsOn` into a graph, so `flisk up --only`, the circular-dependency gate and
 * `flisk config verify` cannot disagree about it. The rules follow the service schema and the generated Tiltfile:
 * - an entry is a service name, or a stack name (the stack's other services, not its frontends, as with `--focus`);
 * - a frontend also waits for its `backendName`;
 * - a name that is neither (a typo, the shared Postgres) is not an edge;
 * - a `dependsOn` that is not a list of strings cannot be followed and gives no edges.
 */
/** The dependsOn names a service declares: none when absent, null when it is not an array of strings. */
export function declaredDependsOn(config) {
    const value = config?.dependsOn;
    if (value === undefined)
        return [];
    if (Array.isArray(value) && value.every((entry) => typeof entry === "string"))
        return value;
    return null;
}
/**
 * The dependency names that can be followed: `dependsOn`, plus the deprecated `dependencies` key the generators still read, plus
 * a bring-your-own sidecar's host (`sidecarOf`, #2908), which has to be up first. A wrong-typed value reads as none (the shape
 * check reports it). Keep in step with declared_dependencies in runtime/engine/topologies/tilt/common/dependencies.star.
 */
export function dependsOnOf(config) {
    const legacy = config?.dependencies;
    const old = Array.isArray(legacy) && legacy.every((entry) => typeof entry === "string") ? legacy : [];
    const host = config?.appType === "bring-your-own" ? config.sidecarOf : undefined;
    const sidecar = typeof host === "string" && host !== "" ? [host] : [];
    return [...new Set([...(declaredDependsOn(config) ?? []), ...old, ...sidecar])];
}
/** service name -> the services it waits for, sorted. A self entry stays, so the cycle check can report it. */
export function dependencyEdges(resources) {
    const byName = new Set(resources.map((resource) => resource.name));
    const byStack = new Map();
    for (const resource of resources) {
        if (!resource.stack)
            continue;
        if ((resource.config?.appType ?? resource.type) === "frontend")
            continue;
        byStack.set(resource.stack, [...(byStack.get(resource.stack) ?? []), resource.name]);
    }
    const edges = new Map();
    for (const resource of resources) {
        const targets = new Set();
        for (const entry of dependsOnOf(resource.config)) {
            if (byName.has(entry)) {
                targets.add(entry);
            }
            else {
                // A stack means its other backend-side services; a stack made of this service alone is no dependency.
                for (const member of byStack.get(entry) ?? [])
                    if (member !== resource.name)
                        targets.add(member);
            }
        }
        const backend = resource.config?.backendName;
        const frontend = (resource.config?.appType ?? resource.type) === "frontend";
        if (frontend && backend && backend !== resource.name && byName.has(backend))
            targets.add(backend);
        edges.set(resource.name, [...targets].sort());
    }
    return edges;
}
/** Frontends whose `backendName` is no service of this project: nothing for the frontend to wait for or call. */
export function unknownBackendNames(resources) {
    const names = new Set(resources.map((resource) => resource.name));
    return resources.flatMap((resource) => {
        const backend = resource.config?.backendName;
        const frontend = (resource.config?.appType ?? resource.type) === "frontend";
        return frontend && typeof backend === "string" && backend && !names.has(backend)
            ? [{ resource: resource.name, name: backend }]
            : [];
    });
}
/** `dependsOn` entries that are neither a service nor a stack of this project (the caller adds its own known names). */
export function unnamedEntries(resources, alsoKnown = new Set()) {
    const known = new Set(alsoKnown);
    for (const resource of resources) {
        known.add(resource.name);
        if (resource.stack)
            known.add(resource.stack);
    }
    return resources.flatMap((resource) => dependsOnOf(resource.config)
        .filter((name) => !known.has(name))
        .map((name) => ({ resource: resource.name, name })));
}
