# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🔗 TILT SDK - DECLARED DEPENDENCIES
# =============================================================================
# Purpose: One reading of a manifest's dependsOn for every generator, so the Tilt
#          resource_deps, the frontend env and the nginx map cannot disagree.
# =============================================================================

def declared_dependencies(manifest):
    """The dependency names a manifest declares: `dependsOn`, plus the deprecated `dependencies` key.

    The CLI still reads `dependencies` (see DEPRECATED_FIELDS in service-manifest.ts), so it counts here too. A value that is
    not a list of strings (a hand edit left a string or an object) yields no names instead of failing the whole Tiltfile with
    "string value is not iterable"; `flisk up` and `flisk config verify` report the wrong type.

    Args:
        manifest: Service manifest dict (may be None)

    Returns:
        list: Distinct dependency names in first-seen order
    """
    names = []
    if not manifest:
        return names
    for key in ['dependsOn', 'dependencies']:
        value = manifest.get(key)
        # All or nothing, as in the CLI (cli/src/utils/dependency-graph.ts): a list with a non-string entry has no valid reading,
        # and keeping its string entries would give Tilt edges the CLI does not see (and its cycle check cannot account for).
        if type(value) != 'list' or [entry for entry in value if type(entry) != 'string']:
            continue
        for entry in value:
            if entry not in names:
                names.append(entry)
    # A bring-your-own sidecar shares its host's network namespace (#2908), so it waits for the host like a dependsOn.
    # Keep in step with dependsOnOf in cli/src/utils/dependency-graph.ts.
    sidecar_of = manifest.get('sidecarOf')
    if manifest.get('appType') == 'bring-your-own' and type(sidecar_of) == 'string' and sidecar_of and sidecar_of not in names:
        names.append(sidecar_of)
    return names


def find_dependency_cycle(edges):
    """One cycle in a dependency graph, as a list of names that starts and ends with the same name, or [] when there is none.

    Starlark has neither recursion nor `while`, so this is a depth-first search with an explicit stack inside a bounded loop.

    Args:
        edges: dict of name -> list of names it waits for. Names that are not keys are ignored; a self edge is not a cycle.

    Returns:
        list: The cycle (for example ['a', 'b', 'a']), or []
    """
    steps = 10
    for name in edges:
        steps += 2 + 2 * len(edges[name])
    state = {}
    for start in sorted(edges.keys()):
        if state.get(start, 0) != 0:
            continue
        state[start] = 1
        stack = [[start, 0]]
        path = [start]
        for _ in range(steps):
            if not stack:
                break
            frame = stack[-1]
            neighbours = edges.get(frame[0], [])
            if frame[1] < len(neighbours):
                nxt = neighbours[frame[1]]
                frame[1] += 1
                if nxt == frame[0] or nxt not in edges:
                    continue
                if state.get(nxt, 0) == 1:
                    return path[path.index(nxt):] + [nxt]
                if state.get(nxt, 0) == 0:
                    state[nxt] = 1
                    stack.append([nxt, 0])
                    path.append(nxt)
            else:
                state[frame[0]] = 2
                stack.pop()
                path.pop()
    return []

