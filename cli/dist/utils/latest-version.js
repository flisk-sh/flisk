// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { FliskError } from "./errors.js";
/** `npx pkg` runs a locally installed copy before it downloads one, so an old install can run silently (#4119). */
export const LATEST_VERSION_URL = "https://registry.npmjs.org/@flisk-sh%2fflisk/latest";
export const LATEST_VERSION_TIMEOUT_MS = 800;
export const LATEST_VERSION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const LATEST_VERSION_CACHE_FILE = "latest-version.json";
function parseParts(raw) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(raw);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}
/** True only when both are plain x.y.z versions and `current` is older than `latest`. */
export function isOlderVersion(current, latest) {
    const left = parseParts(current);
    const right = parseParts(latest);
    if (!left || !right)
        return false;
    for (let index = 0; index < 3; index++) {
        const difference = (left[index] ?? 0) - (right[index] ?? 0);
        if (difference !== 0)
            return difference < 0;
    }
    return false;
}
/** The registry is not asked on CI, with --offline, FLISK_OFFLINE or NO_UPDATE_NOTIFIER. */
export function isLatestVersionCheckSkipped(env = process.env, argv = process.argv) {
    const isSet = (value) => value !== undefined && value !== "" && value !== "0" && value.toLowerCase() !== "false";
    return (isSet(env.CI) ||
        isSet(env.FLISK_OFFLINE) ||
        isSet(env.NO_UPDATE_NOTIFIER) ||
        argv.includes("--offline"));
}
function readCache(path, now) {
    try {
        const parsed = JSON.parse(readFileSync(path, "utf-8"));
        if (typeof parsed !== "object" || parsed === null)
            return null;
        const { version, checkedAt } = parsed;
        if (typeof version !== "string" || typeof checkedAt !== "number")
            return null;
        if (now - checkedAt < 0 || now - checkedAt >= LATEST_VERSION_CACHE_TTL_MS)
            return null;
        return parseParts(version) ? version : null;
    }
    catch {
        return null;
    }
}
/** @internal Fetch the current registry version without using the notice cache. */
export async function fetchRegistryVersion(signal, fetchImpl = fetch) {
    const response = await fetchImpl(LATEST_VERSION_URL, {
        headers: { accept: "application/json" },
        signal,
    });
    if (!response.ok) {
        throw new FliskError(`npm registry returned ${response.status}`, [
            "Check your network connection and npm registry access",
            "Run: npm view @flisk-sh/flisk version",
        ]);
    }
    const body = (await response.json());
    if (typeof body?.version !== "string" || !body.version.trim()) {
        throw new FliskError("npm registry response did not include a version", [
            "Run: npm view @flisk-sh/flisk version",
        ]);
    }
    return body.version;
}
/**
 * The newest published version, or null when it is unknown. Cached for a day under ~/.flisk, and
 * never slower than the timeout: any failure (offline, slow, bad answer) returns null.
 */
export async function fetchLatestVersion(options = {}) {
    const env = options.env ?? process.env;
    if (isLatestVersionCheckSkipped(env, options.argv ?? process.argv))
        return null;
    const now = options.now ?? Date.now();
    const cacheDir = options.cacheDir ?? join(homedir(), ".flisk");
    const cachePath = join(cacheDir, LATEST_VERSION_CACHE_FILE);
    const cached = readCache(cachePath, now);
    if (cached)
        return cached;
    const timeoutMs = options.timeoutMs ?? LATEST_VERSION_TIMEOUT_MS;
    let timer;
    try {
        const controller = new AbortController();
        const request = (async () => {
            const version = await fetchRegistryVersion(controller.signal, options.fetchImpl);
            return parseParts(version) ? version : null;
        })();
        // A hard race, so a fetch that ignores the abort signal still cannot hold the demo.
        const deadline = new Promise((resolve) => {
            timer = setTimeout(() => {
                controller.abort();
                resolve(null);
            }, timeoutMs);
        });
        const version = await Promise.race([request.catch(() => null), deadline]);
        if (version) {
            try {
                mkdirSync(cacheDir, { recursive: true });
                writeFileSync(cachePath, JSON.stringify({ version, checkedAt: now }));
            }
            catch {
                // A cache that cannot be written only costs the next run another lookup.
            }
        }
        return version;
    }
    catch {
        return null;
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
/** Where the running CLI is installed, for the notice: the folder that holds node_modules, with ~ for home. */
export function describeInstallLocation(scriptPath = process.argv[1], home = homedir()) {
    if (!scriptPath)
        return null;
    const marker = `${sep}node_modules${sep}`;
    const index = scriptPath.lastIndexOf(marker);
    if (index <= 0)
        return null;
    const root = scriptPath.slice(0, index + marker.length - 1);
    return home && root.startsWith(home) ? `~${root.slice(home.length)}` : root;
}
export function formatStaleVersionNotice(current, latest, location, command = "npx @flisk-sh/flisk@latest demo") {
    const from = location ? ` from ${location}` : "";
    return `You are running flisk ${current}${from}; ${latest} is out. Run: ${command}`;
}
/** The one-line notice, or null when the running version is current, newer, or the registry is unknown. */
export async function staleVersionNotice(current, options = {}) {
    const latest = await fetchLatestVersion(options);
    if (!latest || !isOlderVersion(current, latest))
        return null;
    return formatStaleVersionNotice(current, latest, describeInstallLocation(options.scriptPath), options.command);
}
