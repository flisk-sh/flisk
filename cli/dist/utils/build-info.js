// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
let buildInfoCache;
export function clearBuildInfoCache() {
    buildInfoCache = undefined;
}
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function findBuildInfoFile() {
    if (process.env.FLISK_BUILD_INFO_PATH !== undefined) {
        return process.env.FLISK_BUILD_INFO_PATH;
    }
    if (process.env.FLISK_BUILD_INFO_FILE !== undefined) {
        return process.env.FLISK_BUILD_INFO_FILE;
    }
    const cliRoot = resolve(__dirname, "..", "..");
    const distDir = resolve(__dirname, "..");
    const candidates = [
        join(cliRoot, "dist-bundle", "build-info.json"),
        join(distDir, "build-info.json"),
        join(cliRoot, "build-info.json"),
        join(__dirname, "build-info.json"),
        join(process.cwd(), "build-info.json"),
        join(process.cwd(), "node_modules", "@flisk-sh", "flisk", "build-info.json"),
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}
export function getBuildInfo(customPath) {
    if (!customPath && buildInfoCache !== undefined) {
        return buildInfoCache;
    }
    const filePath = customPath ?? findBuildInfoFile();
    if (!filePath || !existsSync(filePath)) {
        if (!customPath) {
            buildInfoCache = null;
        }
        return null;
    }
    try {
        const raw = readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw);
        const commit = String(parsed.commit ?? parsed.commitSha ?? parsed.sha ?? "").trim();
        if (!commit) {
            if (!customPath)
                buildInfoCache = null;
            return null;
        }
        const info = {
            ...parsed,
            commit,
            commitSha: commit,
        };
        if (!customPath) {
            buildInfoCache = info;
        }
        return info;
    }
    catch {
        if (!customPath) {
            buildInfoCache = null;
        }
        return null;
    }
}
export function getBuildCommit(customPath) {
    if (process.env.FLISK_BUILD_COMMIT?.trim()) {
        return process.env.FLISK_BUILD_COMMIT.trim();
    }
    const info = getBuildInfo(customPath);
    if (info?.commit) {
        return info.commit;
    }
    if (process.env.GITHUB_SHA?.trim()) {
        return process.env.GITHUB_SHA.trim();
    }
    return "unknown";
}
