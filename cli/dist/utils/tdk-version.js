// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_JSON } from "./constants.js";
function toParts(raw) {
    const match = raw.trim().match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : null;
}
function readMinTdkVersion(projectRoot) {
    try {
        const parsed = JSON.parse(readFileSync(join(projectRoot, ".tdk", PROJECT_JSON), "utf-8"));
        return parsed?.minTdkVersion;
    }
    catch {
        return undefined;
    }
}
export function evaluateTdkVersionFloor(projectRoot, currentVersion) {
    const minimum = readMinTdkVersion(projectRoot);
    if (minimum === undefined)
        return { status: "none" };
    const required = typeof minimum === "string" ? toParts(minimum) : null;
    if (!required || !/^\d+\.\d+\.\d+$/.test(String(minimum).trim())) {
        return {
            status: "malformed",
            message: `.tdk/project.json minTdkVersion ${JSON.stringify(minimum)} is not a version like "1.3.80"`,
            fix: 'Set minTdkVersion to a MAJOR.MINOR.PATCH string, for example "1.3.80".',
        };
    }
    const current = toParts(currentVersion);
    const meets = current !== null &&
        (() => {
            for (const [index, need] of required.entries()) {
                const actual = current[index] ?? 0;
                if (actual !== need)
                    return actual > need;
            }
            return true;
        })();
    const requiredText = required.join(".");
    if (!meets) {
        return {
            status: "too-old",
            required: requiredText,
            message: `flisk ${currentVersion} is older than the ${requiredText} this project requires (minTdkVersion)`,
            fix: "Run: flisk upgrade",
        };
    }
    return { status: "ok", required: requiredText };
}
