const PORT_KEYS = [
    { key: "ingressHttp", label: "HTTP", env: "TDK_HTTP_PORT" },
    { key: "ingressHttps", label: "HTTPS", env: "TDK_HTTPS_PORT" },
    { key: "postgres", label: "Postgres", env: "TDK_POSTGRES_PORT" },
];
/** One line per port Flisk moved off the one it wanted. Ports the user set explicitly are never listed. */
export function formatPortFallbackNotice(plan) {
    const lines = [];
    for (const { key, label, env } of PORT_KEYS) {
        const requested = plan.requested[key];
        const chosen = plan[key];
        if (plan.explicit[key] || chosen === requested)
            continue;
        lines.push(`${label}: wanted ${requested}, using ${chosen} (${plan.reason[key]}). To force ${requested}: ${env}=${requested} flisk up`);
    }
    return lines;
}
