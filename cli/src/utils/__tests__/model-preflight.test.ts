// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import type { DiscoveredResource } from "../../types/index.js";
import {
  collectRequiredModels,
  type ModelPullExec,
  type ModelPullSleep,
  pullModelWithRetries,
  resolveModelReference,
  runModelPreflight,
} from "../model-preflight.js";

describe("resolveModelReference", () => {
  it("returns literal model names unchanged", () => {
    expect(resolveModelReference("ai/granite-embedding-multilingual")).toBe(
      "ai/granite-embedding-multilingual",
    );
    expect(resolveModelReference("ai/smollm2")).toBe("ai/smollm2");
  });

  it("resolves variable references from the environment", () => {
    const env: Record<string, string | undefined> = {
      MY_MODEL: "ai/custom-model",
      EMPTY_MODEL: "",
    };
    const lookup = (key: string) => env[key];

    expect(resolveModelReference("${MY_MODEL}", lookup)).toBe("ai/custom-model");
    expect(resolveModelReference("${MISSING_MODEL}", lookup)).toBe("");
  });

  it("handles :- fallback defaults correctly", () => {
    const env: Record<string, string | undefined> = {
      SET_MODEL: "ai/from-env",
      EMPTY_MODEL: "",
    };
    const lookup = (key: string) => env[key];

    expect(resolveModelReference("${SET_MODEL:-ai/default-model}", lookup)).toBe("ai/from-env");
    expect(resolveModelReference("${EMPTY_MODEL:-ai/default-model}", lookup)).toBe(
      "ai/default-model",
    );
    expect(resolveModelReference("${UNSET_MODEL:-ai/default-model}", lookup)).toBe(
      "ai/default-model",
    );
  });

  it("handles - fallback defaults (unset only) correctly", () => {
    const env: Record<string, string | undefined> = {
      SET_MODEL: "ai/from-env",
      EMPTY_MODEL: "",
    };
    const lookup = (key: string) => env[key];

    expect(resolveModelReference("${SET_MODEL-ai/default-model}", lookup)).toBe("ai/from-env");
    expect(resolveModelReference("${EMPTY_MODEL-ai/default-model}", lookup)).toBe("");
    expect(resolveModelReference("${UNSET_MODEL-ai/default-model}", lookup)).toBe(
      "ai/default-model",
    );
  });
});

describe("collectRequiredModels", () => {
  it("returns an empty list when no services declare models", () => {
    const resources: DiscoveredResource[] = [
      {
        name: "api",
        path: "/app/services/api",
        configPath: "/app/services/api/service.json",
        config: { appName: "api", appType: "backend", stack: "app" },
      },
      {
        name: "web",
        path: "/app/services/web",
        configPath: "/app/services/web/service.json",
        config: { appName: "web", appType: "frontend", stack: "app" },
      },
    ];
    expect(collectRequiredModels(resources)).toEqual([]);
  });

  it("extracts models from bring-your-own services", () => {
    const resources: DiscoveredResource[] = [
      {
        name: "llm-service",
        path: "/app/services/llm",
        configPath: "/app/services/llm/service.json",
        config: {
          appName: "llm-service",
          appType: "bring-your-own",
          stack: "app",
          models: [{ name: "llm", model: "ai/granite-embedding-multilingual" }],
        },
      },
    ];
    expect(collectRequiredModels(resources)).toEqual(["ai/granite-embedding-multilingual"]);
  });

  it("deduplicates model pulls across multiple services", () => {
    const resources: DiscoveredResource[] = [
      {
        name: "service-a",
        path: "/app/services/a",
        configPath: "/app/services/a/service.json",
        config: {
          appName: "service-a",
          appType: "bring-your-own",
          stack: "app",
          models: [
            { name: "shared-model", model: "ai/smollm2" },
            { name: "unique-a", model: "ai/granite-embedding-multilingual" },
          ],
        },
      },
      {
        name: "service-b",
        path: "/app/services/b",
        configPath: "/app/services/b/service.json",
        config: {
          appName: "service-b",
          appType: "bring-your-own",
          stack: "app",
          models: [
            { name: "another-alias", model: "ai/smollm2" },
            { name: "unique-b", model: "ai/qwen3:8B" },
          ],
        },
      },
    ];
    expect(collectRequiredModels(resources)).toEqual([
      "ai/smollm2",
      "ai/granite-embedding-multilingual",
      "ai/qwen3:8B",
    ]);
  });

  it("expands variables during collection using the provided lookup", () => {
    const env: Record<string, string | undefined> = {
      EMBED_MODEL: "ai/custom-granite",
    };
    const resources: DiscoveredResource[] = [
      {
        name: "service",
        path: "/app/services/s",
        configPath: "/app/services/s/service.json",
        config: {
          appName: "service",
          appType: "bring-your-own",
          stack: "app",
          models: [
            { name: "m1", model: "${EMBED_MODEL:-ai/default}" },
            { name: "m2", model: "${CHAT_MODEL:-ai/smollm2}" },
          ],
        },
      },
    ];
    expect(collectRequiredModels(resources, (k) => env[k])).toEqual([
      "ai/custom-granite",
      "ai/smollm2",
    ]);
  });
});

describe("pullModelWithRetries", () => {
  it("succeeds on first attempt without sleep or delay", async () => {
    const exec: ModelPullExec = vi.fn().mockReturnValue({
      status: 0,
      stdout: "Pulling ai/smollm2... done",
      stderr: "",
    });
    const sleep: ModelPullSleep = vi.fn().mockResolvedValue(undefined);

    const result = await pullModelWithRetries("ai/smollm2", { exec, sleep });

    expect(result).toEqual({ ok: true, model: "ai/smollm2", attempts: 1 });
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith("docker", ["model", "pull", "ai/smollm2"]);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("succeeds on second attempt after a transient failure and single 5s delay", async () => {
    const exec: ModelPullExec = vi
      .fn()
      .mockReturnValueOnce({
        status: 1,
        stdout: "",
        stderr: "writing blob: remove incomplete file ... no such file or directory",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: "Pull complete",
        stderr: "",
      });

    const sleepDelays: number[] = [];
    const sleep: ModelPullSleep = vi.fn().mockImplementation(async (ms: number) => {
      sleepDelays.push(ms);
    });

    const retries: Array<{ attempt: number; error: string; delayMs: number }> = [];
    const onRetry = (info: { attempt: number; error: string; delayMs: number }) => {
      retries.push(info);
    };

    const result = await pullModelWithRetries("ai/granite-embedding-multilingual", {
      exec,
      sleep,
      onRetry,
    });

    expect(result).toEqual({
      ok: true,
      model: "ai/granite-embedding-multilingual",
      attempts: 2,
    });
    expect(exec).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleepDelays).toEqual([5000]);
    expect(retries).toHaveLength(1);
    expect(retries[0]?.attempt).toBe(1);
    expect(retries[0]?.delayMs).toBe(5000);
    expect(retries[0]?.error).toContain("writing blob: remove incomplete file");
  });

  it("succeeds on third attempt with exactly two 5s retry delays", async () => {
    const exec: ModelPullExec = vi
      .fn()
      .mockReturnValueOnce({ status: 1, stderr: "transient network error 1" })
      .mockReturnValueOnce({ status: 1, stderr: "transient network error 2" })
      .mockReturnValueOnce({ status: 0, stdout: "ok" });

    const sleepDelays: number[] = [];
    const sleep: ModelPullSleep = vi.fn().mockImplementation(async (ms: number) => {
      sleepDelays.push(ms);
    });

    const result = await pullModelWithRetries("ai/granite-embedding-multilingual", {
      exec,
      sleep,
    });

    expect(result).toEqual({
      ok: true,
      model: "ai/granite-embedding-multilingual",
      attempts: 3,
    });
    expect(exec).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleepDelays).toEqual([5000, 5000]);
  });

  it("fails after exhausting 3 attempts and preserves the actual runner error", async () => {
    const exec: ModelPullExec = vi.fn().mockReturnValue({
      status: 1,
      stderr: "writing blob: remove incomplete file: no such file or directory",
    });

    const sleepDelays: number[] = [];
    const sleep: ModelPullSleep = vi.fn().mockImplementation(async (ms: number) => {
      sleepDelays.push(ms);
    });

    const result = await pullModelWithRetries("ai/granite-embedding-multilingual", {
      exec,
      sleep,
    });

    expect(result).toEqual({
      ok: false,
      model: "ai/granite-embedding-multilingual",
      attempts: 3,
      error: "writing blob: remove incomplete file: no such file or directory",
    });
    expect(exec).toHaveBeenCalledTimes(3);
    // There should only be 2 delays between attempts 1-2 and 2-3 (no delay after 3rd failure)
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleepDelays).toEqual([5000, 5000]);
  });

  it("captures thrown exceptions as error message", async () => {
    const exec: ModelPullExec = vi.fn().mockImplementation(() => {
      throw new Error("docker process crashed");
    });
    const sleep: ModelPullSleep = vi.fn().mockResolvedValue(undefined);

    const result = await pullModelWithRetries("ai/smollm2", {
      maxAttempts: 2,
      retryDelayMs: 100,
      exec,
      sleep,
    });

    expect(result).toEqual({
      ok: false,
      model: "ai/smollm2",
      attempts: 2,
      error: "docker process crashed",
    });
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});

describe("runModelPreflight", () => {
  it("resolves successfully when models list is empty", async () => {
    const exec: ModelPullExec = vi.fn();
    const result = await runModelPreflight([], { exec });
    expect(result).toEqual({ ok: true, pulled: [] });
    expect(exec).not.toHaveBeenCalled();
  });

  it("pulls all required models in sequence", async () => {
    const pulledModels: string[] = [];
    const exec: ModelPullExec = vi.fn().mockImplementation((_cmd, args) => {
      pulledModels.push(args[2] as string);
      return { status: 0, stdout: "ok" };
    });
    const sleep: ModelPullSleep = vi.fn().mockResolvedValue(undefined);

    const result = await runModelPreflight(["ai/smollm2", "ai/granite-embedding-multilingual"], {
      exec,
      sleep,
    });

    expect(result).toEqual({
      ok: true,
      pulled: ["ai/smollm2", "ai/granite-embedding-multilingual"],
    });
    expect(pulledModels).toEqual(["ai/smollm2", "ai/granite-embedding-multilingual"]);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("stops immediately and reports the failing model when retries are exhausted", async () => {
    const exec: ModelPullExec = vi.fn().mockImplementation((_cmd, args) => {
      const model = args[2] as string;
      if (model === "ai/smollm2") {
        return { status: 0, stdout: "ok" };
      }
      return {
        status: 1,
        stderr: "writing blob: remove incomplete file: no such file or directory",
      };
    });
    const sleep: ModelPullSleep = vi.fn().mockResolvedValue(undefined);

    const result = await runModelPreflight(
      ["ai/smollm2", "ai/granite-embedding-multilingual", "ai/qwen3:8B"],
      { exec, sleep },
    );

    expect(result).toEqual({
      ok: false,
      failedModel: "ai/granite-embedding-multilingual",
      attempts: 3,
      error: "writing blob: remove incomplete file: no such file or directory",
    });
    // Third model (ai/qwen3:8B) should not have been called
    expect(exec).toHaveBeenCalledTimes(4); // 1 for smollm2 + 3 for granite
  });
});
