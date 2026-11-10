// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import type { DiscoveredResource } from "../types/index.js";

export const DEFAULT_MODEL_PULL_RETRIES = 3;
export const DEFAULT_MODEL_PULL_DELAY_MS = 5000;

export interface ModelPullExecResult {
  status: number | null;
  stdout?: string;
  stderr?: string;
  error?: Error;
}

export type ModelPullExec = (command: string, args: string[]) => ModelPullExecResult;
export type ModelPullSleep = (ms: number) => Promise<void>;

export interface ModelPullOptions {
  maxAttempts?: number;
  retryDelayMs?: number;
  exec?: ModelPullExec;
  sleep?: ModelPullSleep;
  lookupEnv?: (name: string) => string | undefined;
  onAttempt?: (info: { model: string; attempt: number; maxAttempts: number }) => void;
  onRetry?: (info: {
    model: string;
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    error: string;
  }) => void;
  onSuccess?: (info: { model: string; attempt: number }) => void;
}

export type ModelPullResult =
  | { ok: true; model: string; attempts: number }
  | { ok: false; model: string; attempts: number; error: string };

export type ModelPreflightResult =
  | { ok: true; pulled: string[] }
  | { ok: false; failedModel: string; attempts: number; error: string };

/**
 * Resolves a model reference from service.json, evaluating Compose variable expansions
 * such as `${NAME}`, `${NAME:-default}`, or `${NAME-default}` against the environment lookup.
 */
export function resolveModelReference(
  rawModel: string,
  lookupEnv: (name: string) => string | undefined = (name) => process.env[name],
): string {
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
    return val !== undefined && val.trim() !== "" ? val.trim() : fallback.trim();
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
export function collectRequiredModels(
  resources: readonly DiscoveredResource[],
  lookupEnv: (name: string) => string | undefined = (name) => process.env[name],
): string[] {
  const models = new Set<string>();
  for (const resource of resources) {
    const serviceModels = (
      resource.config as { models?: Array<{ name?: string; model?: string }> } | undefined
    )?.models;
    if (!Array.isArray(serviceModels)) continue;
    for (const entry of serviceModels) {
      if (!entry || typeof entry.model !== "string") continue;
      const resolved = resolveModelReference(entry.model, lookupEnv);
      if (resolved) {
        models.add(resolved);
      }
    }
  }
  return [...models];
}

function defaultExec(command: string, args: string[]): ModelPullExecResult {
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

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pulls a single model using Docker Model Runner with bounded retries.
 * Retries up to maxAttempts (default 3) with retryDelayMs (default 5000ms) between failures.
 * Returns immediately without delay upon success.
 */
export async function pullModelWithRetries(
  model: string,
  options: ModelPullOptions = {},
): Promise<ModelPullResult> {
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
      const rawError = (res.stderr || res.stdout || res.error?.message || "").trim();
      lastError = rawError || `docker model pull exited with code ${res.status ?? "unknown"}`;
    } catch (err) {
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
export async function runModelPreflight(
  models: readonly string[],
  options: ModelPullOptions = {},
): Promise<ModelPreflightResult> {
  const pulled: string[] = [];
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
