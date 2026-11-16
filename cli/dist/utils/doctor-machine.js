import { existsSync } from "node:fs";
import { join } from "node:path";
import { projectNeedsDatabaseKeys } from "./capabilities.js";
import { MASTER_CONFIG_FILES } from "./constants.js";
import { validateEnvFile } from "./env-validator.js";
import { evaluateFliskVersion } from "./flisk-version.js";
import { fetchLatestVersion, isOlderVersion } from "./latest-version.js";
import { findProjectRoot, getPackageVersion } from "./paths.js";
import { isWsl as detectWsl } from "./platform.js";
export const WSL2_DOCTOR_MESSAGE = "WSL2 detected. Use Docker Desktop WSL integration. Guide: docs/wsl2.md";
// Machine and install checks: environment, master configs, WSL paths, bind addresses and Flisk versions.
export function checkWslProjectLocation(projectPath, strict, isWsl = detectWsl()) {
    if (!isWsl) {
        return {
            name: "WSL project location",
            didPass: true,
            isSkipped: true,
            message: "Not running in WSL2 - skipped project filesystem check",
        };
    }
    const normalized = projectPath.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    if (normalized !== "/mnt/c" && !normalized.startsWith("/mnt/c/")) {
        return {
            name: "WSL project location",
            didPass: true,
            message: `${WSL2_DOCTOR_MESSAGE} Project is on the WSL filesystem.`,
        };
    }
    const message = `${WSL2_DOCTOR_MESSAGE} Project is under /mnt/c (${projectPath}); hot reload may be broken. Move it into the WSL filesystem, such as ~/projects.`;
    return {
        name: "WSL project location",
        didPass: !strict,
        isWarning: !strict,
        message,
        fix: "Move the repository under your WSL home directory (for example, ~/projects) and retry flisk doctor.",
    };
}
/** True for IPv4 0.0.0.0 and any IPv6 unspecified form (::, 0:0::0, [::], ...). */
export function isWildcardBindAddress(value) {
    const host = value.replace(/^\[(.*)\]$/, "$1");
    if (host === "0.0.0.0")
        return true;
    // IPv4-embedded unspecified address, e.g. ::0.0.0.0
    if (/^[0:]*:0\.0\.0\.0$/.test(host))
        return true;
    return host.includes(":") && /^[0:]+$/.test(host);
}
/**
 * Dev ports (Traefik, Postgres) bind to 127.0.0.1 by default. FLISK_BIND_ADDRESS
 * opts in to another address; a wildcard exposes them to every machine on the
 * network (GHSA-3hj3-f39v-j2x5).
 */
export function checkPublishedBindAddress(env = process.env, strict = false) {
    const bindAddress = (env.FLISK_BIND_ADDRESS ?? "").trim();
    if (!isWildcardBindAddress(bindAddress)) {
        return {
            name: "Dev Port Bind Address",
            didPass: true,
            message: bindAddress
                ? `Dev ports bind to ${bindAddress}`
                : "Dev ports bind to 127.0.0.1 (this machine only)",
        };
    }
    return {
        name: "Dev Port Bind Address",
        didPass: !strict,
        isWarning: !strict,
        message: `FLISK_BIND_ADDRESS is ${bindAddress}: Traefik and Postgres are reachable from other machines on the network.`,
        fix: "Unset FLISK_BIND_ADDRESS to keep dev ports on 127.0.0.1. Keep it only when you test from another device on purpose.",
    };
}
export function checkEnvironmentVariables() {
    const projectRoot = findProjectRoot() ?? process.cwd();
    const validation = validateEnvFile(projectRoot, {
        databaseKeys: projectNeedsDatabaseKeys(projectRoot),
    });
    if (validation.missing.length > 0) {
        return {
            name: "Environment Variables",
            didPass: false,
            message: `Missing required env variables: ${validation.missing.join(", ")}`,
            fix: existsSync(join(projectRoot, ".env"))
                ? `Edit .env and set these values:\n    ${validation.missing.map((v) => `${v}=<value>`).join("\n    ")}`
                : "No .env file yet. Run `flisk project` to create one with working defaults.",
        };
    }
    if (validation.invalid.length > 0) {
        return {
            name: "Environment Variables",
            didPass: false,
            message: `Invalid env variables: ${validation.invalid.join(", ")}`,
            fix: "Edit .env and provide values for empty variables",
        };
    }
    // `validateEnvFile` also reports non-fatal problems (for example a DATABASE_URL password that differs from DB_PASSWORD). The
    // "no .env yet" notice is not one of them: that case is reported as missing keys above.
    const warnings = validation.warnings.filter((warning) => !warning.startsWith(".env file not found"));
    return {
        name: "Environment Variables",
        didPass: true,
        message: warnings.length > 0
            ? `All required environment variables are set (warning: ${warnings.join("; ")})`
            : "All required environment variables are set",
    };
}
export function checkMasterConfigs() {
    // `flisk project` writes generated master configs to .flisk/.flisk-out/, not the
    // project root, so look there (and walk up to find the project root, same
    // as every other command that reads project state).
    const projectRoot = findProjectRoot() ?? process.cwd();
    const outDir = join(projectRoot, ".flisk", ".flisk-out");
    const missing = MASTER_CONFIG_FILES.filter((file) => !existsSync(join(outDir, file)));
    if (missing.length === 0) {
        return {
            name: "Master Configs",
            didPass: true,
            message: `${MASTER_CONFIG_FILES.join(", ")} found`,
        };
    }
    return {
        name: "Master Configs",
        didPass: false,
        message: `Master configs missing: ${missing.join(", ")}`,
        fix: "Run: flisk project",
    };
}
/**
 * Checks the project's minimum and exact pinned CLI version.
 * Shared with `flisk up` so both commands report the same message and fix.
 */
export function checkFliskVersion(currentVersion = getPackageVersion()) {
    const projectRoot = findProjectRoot();
    if (!projectRoot) {
        return {
            name: "Flisk version",
            didPass: true,
            isSkipped: true,
            message: "Not in a project - skipping Flisk version check",
        };
    }
    const version = evaluateFliskVersion(projectRoot, currentVersion);
    const warning = version.deprecationWarning ? `\nWarning: ${version.deprecationWarning}` : "";
    if (version.status === "none") {
        return {
            name: "Flisk version",
            didPass: true,
            isSkipped: true,
            message: `flisk ${currentVersion} (no minFliskVersion or pinnedFliskVersion in .flisk/project.json)${warning}`,
        };
    }
    if (version.status !== "ok") {
        return {
            name: "Flisk version",
            didPass: false,
            message: `${version.message}${warning}`,
            fix: version.fix,
        };
    }
    const requirement = version.source === "pin"
        ? `matches pinnedFliskVersion ${version.required}`
        : `meets minFliskVersion ${version.required}`;
    return {
        name: "Flisk version",
        didPass: true,
        isWarning: Boolean(version.deprecationWarning),
        message: `flisk ${currentVersion} ${requirement}${warning}`,
    };
}
/** A CLI older than the latest release is a warning, never a failure; an unreachable registry is skipped (#4119). */
export async function checkLatestFliskVersion(currentVersion = getPackageVersion(), lookup = () => fetchLatestVersion()) {
    const latest = await lookup();
    if (!latest) {
        return {
            name: "Latest Flisk version",
            didPass: true,
            isSkipped: true,
            message: "Could not read the latest version (offline, CI, or slow registry) - skipping",
        };
    }
    if (isOlderVersion(currentVersion, latest)) {
        return {
            name: "Latest Flisk version",
            didPass: true,
            isWarning: true,
            message: `flisk ${currentVersion} is older than the latest release ${latest}`,
            fix: "Run: flisk upgrade (or npx @flisk-sh/flisk@latest demo)",
        };
    }
    return {
        name: "Latest Flisk version",
        didPass: true,
        message: `flisk ${currentVersion} is up to date`,
    };
}
