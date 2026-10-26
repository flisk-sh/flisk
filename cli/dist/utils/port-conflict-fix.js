/** The env var that moves each host port Flisk publishes. Services publish no host ports, so only these conflict. */
const PORT_ENV_VARS = {
    "80": "FLISK_HTTP_PORT",
    "443": "FLISK_HTTPS_PORT",
    "5432": "FLISK_POSTGRES_PORT",
};
/** The host port a conflict message is about, or null when the message is not a port conflict. */
export function conflictPort(message) {
    // The raw Docker error can reach the report when the readiness check fails before the summary runs.
    const match = message.match(/^host port (\d+) is already allocated$/) ??
        message.match(/Bind for [^ ]+:(\d+) failed: port is already allocated/i);
    return match ? Number(match[1]) : null;
}
/**
 * The next step for a host port another process already holds. When the occupant is known it is named; otherwise the
 * command that finds it is given instead.
 */
export function portConflictFix(message, occupant = null) {
    const port = conflictPort(message);
    if (port === null)
        return null;
    const envVar = PORT_ENV_VARS[String(port)];
    const body = occupant
        ? `Fix: port ${port} is held by ${occupant.command} (pid ${occupant.pid}). Stop it`
        : `Fix: stop the process using port ${port} (find it with: lsof -nP -iTCP:${port} -sTCP:LISTEN)`;
    return envVar ? `${body}, or set ${envVar} to a free port and run flisk up` : body;
}
