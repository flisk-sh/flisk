// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/** The env var that moves each host port Flisk publishes. Services publish no host ports, so only these conflict. */
const PORT_ENV_VARS = {
    "80": "TDK_HTTP_PORT",
    "443": "TDK_HTTPS_PORT",
    "5432": "TDK_POSTGRES_PORT",
};
/**
 * The next step for a host port another process already holds. The occupant is not named: finding it needs the OS, so
 * the command that finds it is given instead.
 */
export function portConflictFix(message) {
    // The raw Docker error can reach the report when the readiness check fails before the summary runs.
    const match = message.match(/^host port (\d+) is already allocated$/) ??
        message.match(/Bind for [^ ]+:(\d+) failed: port is already allocated/i);
    if (!match)
        return null;
    const port = match[1];
    const find = `find it with: lsof -nP -iTCP:${port} -sTCP:LISTEN`;
    const envVar = PORT_ENV_VARS[port];
    if (!envVar)
        return `Fix: stop the process using port ${port} (${find})`;
    return `Fix: stop the process using port ${port} (${find}), or set ${envVar} to a free port and run flisk up`;
}
