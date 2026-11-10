// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
export const DEFAULT_MODEL_PULL_RETRIES = 3;
export const DEFAULT_MODEL_PULL_DELAY_MS = 5000;
/**
 * Resolves a model reference from service.json, evaluating Compose variable expansions
 * such as `${NAME}`, `${NAME:-default}`, or `${NAME-default}` against the environment lookup.
 */
export function resolveModelReference(rawModel, lookupEnv = (name) => process.env[name]) {
    const trimmed = rawModel.trim();
    if (!trimmed.startsWith("${") || !trimmed.endsWith("}")) {
        return trimmed;
    }
    const inner = trimmed.slice(2, -1);
    const colonDash = inner.indexOf(":-");
    if (colonDash !== -1) {
        const varName = inner.slice(0, colonDash);
        const fallback = inner.slice(colonDash + 2);
        const val = lookupEnv(varName);
        return val !== undefined && val.trim() !== ""
            ? val.trim()
            : fallback.trim();
    }
    const dash = inner.indexOf("-");
    if (dash !== -1) {
        const varName = inner.slice(0, dash);
        const fallback = inner.slice(dash + 1);
        const val = lookupEnv(varName);
        return val !== undefined ? val.trim() : fallback.trim();
    }
    const val = lookupEnv(inner);
    return val ? val.trim() : "";
}
/**
 * Collects and deduplicates required model names across the given services.
 * Deduplication preserves first-seen order and skips empty or non-string model entries.
 */
export function collectRequiredModels(resources, lookupEnv = (name) => process.env[name]) {
    const models = new Set();
    for (const resource of resources) {
        const serviceModels = resource.config?.models;
        if (!Array.isArray(serviceModels))
            continue;
        for (const entry of serviceModels) {
            if (!entry || typeof entry.model !== "string")
                continue;
            const resolved = resolveModelReference(entry.model, lookupEnv);
            if (resolved) {
                models.add(resolved);
            }
        }
    }
    return [...models];
}
function defaultExec(command, args) {
    const res = spawnSync(command, args, {
        encoding: "utf-8",
        timeout: 600_000,
        stdio: ["ignore", "pipe", "pipe"],
    });
    return {
        status: res.status,
        stdout: res.stdout ?? "",
        stderr: res.stderr ?? "",
        error: res.error,
    };
}
function defaultSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Pulls a single model using Docker Model Runner with bounded retries.
 * Retries up to maxAttempts (default 3) with retryDelayMs (default 5000ms) between failures.
 * Returns immediately without delay upon success.
 */
export async function pullModelWithRetries(model, options = {}) {
    const maxAttempts = options.maxAttempts ?? DEFAULT_MODEL_PULL_RETRIES;
    const retryDelayMs = options.retryDelayMs ?? DEFAULT_MODEL_PULL_DELAY_MS;
    const exec = options.exec ?? defaultExec;
    const sleep = options.sleep ?? defaultSleep;
    let lastError = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        options.onAttempt?.({ model, attempt, maxAttempts });
        try {
            const res = exec("docker", ["model", "pull", model]);
            if (res.status === 0 && !res.error) {
                options.onSuccess?.({ model, attempt });
                return { ok: true, model, attempts: attempt };
            }
            const rawError = (res.stderr ||
                res.stdout ||
                res.error?.message ||
                "").trim();
            lastError =
                rawError ||
                    `docker model pull exited with code ${res.status ?? "unknown"}`;
        }
        catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
        }
        if (attempt < maxAttempts) {
            options.onRetry?.({
                model,
                attempt,
                maxAttempts,
                delayMs: retryDelayMs,
                error: lastError,
            });
            await sleep(retryDelayMs);
        }
    }
    return { ok: false, model, attempts: maxAttempts, error: lastError };
}
/**
 * Runs preflight pulls for all given models in sequence.
 * Halts on first failure after retries are exhausted and returns the failing model details.
 */
export async function runModelPreflight(models, options = {}) {
    const pulled = [];
    for (const model of models) {
        const res = await pullModelWithRetries(model, options);
        if (!res.ok) {
            return {
                ok: false,
                failedModel: res.model,
                attempts: res.attempts,
                error: res.error,
            };
        }
        pulled.push(model);
    }
    return { ok: true, pulled };
}
