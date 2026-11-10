import type { DiscoveredResource } from "../types/index.js";
export declare const DEFAULT_MODEL_PULL_RETRIES = 3;
export declare const DEFAULT_MODEL_PULL_DELAY_MS = 5000;
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
    onAttempt?: (info: {
        model: string;
        attempt: number;
        maxAttempts: number;
    }) => void;
    onRetry?: (info: {
        model: string;
        attempt: number;
        maxAttempts: number;
        delayMs: number;
        error: string;
    }) => void;
    onSuccess?: (info: {
        model: string;
        attempt: number;
    }) => void;
}
export type ModelPullResult = {
    ok: true;
    model: string;
    attempts: number;
} | {
    ok: false;
    model: string;
    attempts: number;
    error: string;
};
export type ModelPreflightResult = {
    ok: true;
    pulled: string[];
} | {
    ok: false;
    failedModel: string;
    attempts: number;
    error: string;
};
/**
 * Resolves a model reference from service.json, evaluating Compose variable expansions
 * such as `${NAME}`, `${NAME:-default}`, or `${NAME-default}` against the environment lookup.
 */
export declare function resolveModelReference(rawModel: string, lookupEnv?: (name: string) => string | undefined): string;
/**
 * Collects and deduplicates required model names across the given services.
 * Deduplication preserves first-seen order and skips empty or non-string model entries.
 */
export declare function collectRequiredModels(resources: readonly DiscoveredResource[], lookupEnv?: (name: string) => string | undefined): string[];
/**
 * Pulls a single model using Docker Model Runner with bounded retries.
 * Retries up to maxAttempts (default 3) with retryDelayMs (default 5000ms) between failures.
 * Returns immediately without delay upon success.
 */
export declare function pullModelWithRetries(model: string, options?: ModelPullOptions): Promise<ModelPullResult>;
/**
 * Runs preflight pulls for all given models in sequence.
 * Halts on first failure after retries are exhausted and returns the failing model details.
 */
export declare function runModelPreflight(models: readonly string[], options?: ModelPullOptions): Promise<ModelPreflightResult>;
