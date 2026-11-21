// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
export const DEFAULT_SMOKE_TIMEOUT_SECONDS = 60;
/** Largest response body kept in a smoke record. */
export const SMOKE_RECORD_BODY_MAX_BYTES = 64 * 1024;
export function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function validateSmoke(smoke) {
    if (!isRecord(smoke))
        return ['smoke: must be an object with "via" and "steps"'];
    const errors = [];
    if (smoke.via !== "proxy") {
        errors.push('smoke.via: only "proxy" is supported (the check must go through the public URL)');
    }
    if (smoke.timeoutSeconds !== undefined &&
        !(typeof smoke.timeoutSeconds === "number" && smoke.timeoutSeconds > 0)) {
        errors.push("smoke.timeoutSeconds: must be a number greater than 0");
    }
    if (!Array.isArray(smoke.steps) || smoke.steps.length === 0) {
        errors.push("smoke.steps: needs at least one step");
        return errors;
    }
    smoke.steps.forEach((step, index) => {
        const at = `smoke.steps[${index}]`;
        if (!isRecord(step)) {
            errors.push(`${at}: must be an object`);
            return;
        }
        const path = step.path;
        if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
            errors.push(`${at}.path: must start with "/" and is appended to the public URL; a full URL or relative path would skip the proxy`);
        }
        if (step.expect !== undefined &&
            !(typeof step.expect === "number" &&
                Number.isInteger(step.expect) &&
                step.expect >= 100 &&
                step.expect <= 599)) {
            errors.push(`${at}.expect: must be an HTTP status between 100 and 599`);
        }
        if (step.bodyContains !== undefined && typeof step.bodyContains !== "string") {
            errors.push(`${at}.bodyContains: must be a string`);
        }
        if (step.save !== undefined) {
            const ok = isRecord(step.save) &&
                Object.values(step.save).every((v) => typeof v === "string" && v.startsWith("$."));
            if (!ok)
                errors.push(`${at}.save: must map names to paths such as "$.id"`);
        }
    });
    return errors;
}
