// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * Expands `${VAR}` and `${VAR:-default}` from `vars`. An unknown variable without a default becomes an empty string, the way a
 * shell expands it, and is reported through `onMissing` so `flisk up` can say which one.
 */
export function expandEnvValue(value, vars, onMissing = () => { }) {
    return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (_match, name, fallback) => {
        const found = vars[name];
        if (found !== undefined && found !== "")
            return found;
        if (fallback !== undefined)
            return fallback;
        onMissing(name);
        return "";
    });
}
