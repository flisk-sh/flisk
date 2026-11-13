import { CONTAINER_RUNTIME_CHECK } from "./constants.js";
import { DISK_SAFE_CLEANUP, DISK_SPACE_CHECK } from "./doctor-host.js";
const POSIX = (platform) => platform === "darwin" || platform === "linux";
function conflictingPort(result) {
    const match = /^\s*(\d{2,5}) \(/m.exec(result.message);
    return match ? Number(match[1]) : null;
}
function inspectPort(platform, port) {
    if (port === null)
        return null;
    if (platform === "darwin")
        return `lsof -nP -iTCP:${port} -sTCP:LISTEN`;
    if (platform === "linux")
        return `ss -ltnp 'sport = :${port}'`;
    if (platform === "win32")
        return `netstat -ano | findstr /c:":${port} "`;
    return null;
}
const RULES = {
    [CONTAINER_RUNTIME_CHECK]: {
        tier: 0,
        command: (platform) => platform === "darwin"
            ? "open -a Docker"
            : platform === "linux" && !process.env.WSL_DISTRO_NAME
                ? "sudo systemctl start docker"
                : null,
    },
    Colima: { tier: 1, command: (platform) => (POSIX(platform) ? "colima start" : null) },
    "Host Ports": {
        tier: 2,
        command: (platform, result) => inspectPort(platform, conflictingPort(result)),
    },
    "Ingress Ports": { tier: 2, command: () => null },
    "Tilt CLI": {
        tier: 3,
        command: (platform) => POSIX(platform)
            ? "curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash"
            : null,
    },
    Bun: {
        tier: 3,
        command: (platform) => (POSIX(platform) ? "curl -fsSL https://bun.sh/install | bash" : null),
    },
    "Docker Network Pool": { tier: 4, command: () => "flisk down --prune-networks" },
    "Docker networks": { tier: 4, command: () => "flisk down --prune-networks" },
    // Build cache only: it frees the most after image builds and never removes an image, container or volume a running
    // stack uses. `docker system prune -af` deleted every unused image, so the next `flisk up` rebuilt them all.
    [DISK_SPACE_CHECK]: { tier: 5, command: () => DISK_SAFE_CLEANUP },
    "Flisk installs": { tier: 6, command: () => "flisk upgrade" },
    "Flisk version": { tier: 6, command: () => "flisk upgrade" },
    "Master Configs": { tier: 7, command: () => "flisk project" },
    "Generated Runtime Assets": { tier: 7, command: () => "flisk config regenerate" },
    "Starlark Load Exports": { tier: 7, command: () => "flisk config regenerate" },
};
/** Project-level findings come after every machine-level one that has no rule. */
const UNRANKED_TIER = 99;
export function checkId(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
/**
 * Failing checks ordered by how much they block, each with one runnable command. Hard failures come before
 * warnings (a low-disk warning never outranks a stopped daemon), and a port 5432 conflict leads the port tier.
 * Checks without a command that is valid on this platform are left out; their prose fix is still printed.
 */
export function rankDoctorFixes(results, platform = process.platform) {
    const candidates = results
        .filter((result) => !result.didPass && !result.isSkipped)
        .map((result, index) => {
        const rule = RULES[result.name];
        return {
            result,
            index,
            tier: rule?.tier ?? UNRANKED_TIER,
            command: rule?.command(platform, result) ?? null,
        };
    })
        .filter((entry) => entry.command !== null);
    const weight = (entry) => (entry.result.isWarning ? 1000 : 0) +
        entry.tier * 10 +
        (entry.result.name === "Host Ports" && conflictingPort(entry.result) === 5432 ? 0 : 1);
    candidates.sort((left, right) => weight(left) - weight(right) || left.index - right.index);
    return candidates.map((entry, position) => ({
        rank: position + 1,
        checkId: checkId(entry.result.name),
        check: entry.result.name,
        command: entry.command,
    }));
}
/** The human "Fix first" section, or an empty list when there is nothing to run. */
export function formatFixFirst(fixes) {
    if (fixes.length === 0)
        return [];
    return fixes.flatMap((fix) => [`  ${fix.rank}. ${fix.check}`, `     ${fix.command}`]);
}
