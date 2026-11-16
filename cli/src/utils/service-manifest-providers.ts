// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { isPlainObject } from "./is-plain-object.js";
import { declaresCommand } from "./native-service.js";
import { ENV_NAME_PATTERN, hasLineBreakOrControl } from "./service-manifest-shared.js";

/** A model reference such as ai/smollm2, ai/qwen3:8B-Q4_K_M or hf.co/org/name. */
const MODEL_REFERENCE = "[A-Za-z0-9][A-Za-z0-9._/:@-]*";
/** `models[].model`: a model reference, or a Compose variable `${NAME}`, `${NAME:-<model reference>}` or `${NAME-<model reference>}`. */
const MODEL_VALUE_PATTERN = new RegExp(
  `^(${MODEL_REFERENCE}|\\$\\{[A-Za-z_][A-Za-z0-9_]*(:?-${MODEL_REFERENCE})?\\})$`,
);

/**
 * `models` (Compose / Docker Model Runner): models a bring-your-own resource uses, each `{ "name": "llm", "model": "ai/smollm2" }`.
 * The service gets `models: [llm]` and the stack's Compose file a top-level `models:` entry. `model` is written quoted into the
 * generated YAML, so only a model reference or a Compose variable is accepted. Mirrors engine/.../compose/byo_models.star.
 */
export function modelsErrors(manifest: Record<string, unknown>, displayPath: string): string[] {
  const models = manifest.models;
  if (models === undefined || models === null) return [];
  const field = `${displayPath}.models`;
  if (!Array.isArray(models)) {
    return [`${field}: expected a list such as [{"name": "llm", "model": "ai/smollm2"}]`];
  }
  if (manifest.appType !== "bring-your-own") {
    return [`${field}: only applies to bring-your-own resources (appType "bring-your-own")`];
  }
  const errors: string[] = [];
  const names = new Set<string>();
  models.forEach((entry: unknown, i) => {
    const at = `${field}[${i}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${at}: expected an object such as {"name": "llm", "model": "ai/smollm2"}`);
      return;
    }
    for (const key of Object.keys(entry)) {
      if (key !== "name" && key !== "model")
        errors.push(`${at}.${key}: unknown option (use name, model)`);
    }
    const { name, model } = entry;
    if (typeof name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) {
      errors.push(
        `${at}.name: expected a model name such as llm (letters, digits, '-', '_' and '.')`,
      );
    } else if (names.has(name)) {
      errors.push(`${at}.name: ${name} is listed twice`);
    } else {
      names.add(name);
    }
    if (typeof model !== "string" || !MODEL_VALUE_PATTERN.test(model)) {
      errors.push(
        `${at}.model: expected a model such as ai/smollm2, or a variable such as \${LLM_MODEL} or \${LLM_MODEL:-ai/smollm2}`,
      );
    }
  });
  return errors;
}

/**
 * `env` on a bring-your-own resource (#2923): plain, committed configuration written into the container's Compose `environment`.
 * A command service's `env` is checked with the other command-service fields (validateNativeServiceFields). Mirrors
 * engine/.../compose/byo_env.star.
 */
export function byoEnvErrors(manifest: Record<string, unknown>, displayPath: string): string[] {
  const env = manifest.env;
  if (env === undefined || env === null || manifest.appType !== "bring-your-own") return [];
  if (declaresCommand(manifest)) return [];
  const field = `${displayPath}.env`;
  if (!isPlainObject(env)) return [`${field}: expected an object of string values`];
  const errors: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (!ENV_NAME_PATTERN.test(name)) {
      errors.push(
        `${field}.${name}: names must be letters, digits or _, not starting with a digit`,
      );
    } else if (typeof value !== "string") {
      errors.push(`${field}.${name}: expected a string`);
    } else if (hasLineBreakOrControl(value)) {
      errors.push(`${field}.${name}: must not contain line breaks or control characters`);
    }
  }
  return errors;
}

/**
 * `provides`: the connection settings a resource gives the services that list it in `dependsOn` (REDIS_URL for a Redis).
 * Each one is written into the dependent's generated env file, which `flisk config verify` checks and which must hold no
 * secret, so the values are plain URLs and names. Mirrors _dependency_provides_lines in
 * engine/.../orchestrator/generators/env.star.
 */
export function providesErrors(manifest: Record<string, unknown>, displayPath: string): string[] {
  const provides = manifest.provides;
  if (provides === undefined || provides === null) return [];
  const field = `${displayPath}.provides`;
  if (!isPlainObject(provides)) {
    return [`${field}: expected an object such as { "REDIS_URL": "redis://cache:6379" }`];
  }
  const errors: string[] = [];
  for (const [key, value] of Object.entries(provides)) {
    if (!ENV_NAME_PATTERN.test(key)) {
      errors.push(`${field}.${key}: expected an environment variable name such as REDIS_URL`);
    }
    if (typeof value !== "string" || !/^[A-Za-z0-9_\-./:@%+=,]+$/.test(value)) {
      errors.push(`${field}.${key}: expected a URL or value without spaces, quotes or $`);
    }
  }
  return errors;
}

const PROVIDER_KEYS = ["url", "tokenSecret", "fallback", "required"];
const PROVIDER_TYPES = new Set(["backend", "worker", "mcp", "agent", "bring-your-own"]);

/** One entry of `providers`, with `required` resolved: a token is required unless the provider has a local fallback. */
export interface ProviderSpec {
  id: string;
  url: string;
  tokenSecret?: string;
  fallback?: string;
  required: boolean;
}

/** The well-formed entries of `providers` (malformed ones are reported by {@link providersErrors}). */
export function providersOf(manifest: Record<string, unknown> | undefined): ProviderSpec[] {
  const providers = manifest?.providers;
  if (!isPlainObject(providers)) return [];
  return Object.entries(providers).flatMap(([id, entry]) => {
    if (!isPlainObject(entry) || typeof entry.url !== "string") return [];
    const tokenSecret = typeof entry.tokenSecret === "string" ? entry.tokenSecret : undefined;
    const fallback = typeof entry.fallback === "string" ? entry.fallback : undefined;
    const required =
      typeof entry.required === "boolean"
        ? entry.required
        : tokenSecret !== undefined && fallback === undefined;
    return [{ id, url: entry.url, tokenSecret, fallback, required }];
  });
}

/**
 * `providers`: external endpoints a service calls (IBM Quantum, Amazon Braket, a hosted model API) with the secret that holds
 * their token, and optionally a local resource to use while the token is missing. Mirrors
 * engine/.../docker/secrets/providers.star, which refuses the same values.
 */
export function providersErrors(manifest: Record<string, unknown>, displayPath: string): string[] {
  const providers = manifest.providers;
  if (providers === undefined || providers === null) return [];
  const field = `${displayPath}.providers`;
  if (!isPlainObject(providers)) {
    return [`${field}: expected an object such as { "ibm-quantum": { "url": "https://..." } }`];
  }
  if (typeof manifest.command === "string" || !PROVIDER_TYPES.has(String(manifest.appType))) {
    return [
      `${field}: only applies to container services (backend, worker, mcp, agent, bring-your-own)`,
    ];
  }
  const dependsOn = Array.isArray(manifest.dependsOn) ? manifest.dependsOn : [];
  const errors: string[] = [];
  for (const [id, entry] of Object.entries(providers)) {
    const at = `${field}.${id}`;
    if (!/^[a-z][a-z0-9-]*$/.test(id)) {
      errors.push(`${at}: name it in lowercase letters, digits and '-', such as ibm-quantum`);
    }
    if (!isPlainObject(entry)) {
      errors.push(`${at}: expected an object such as { "url": "https://..." }`);
      continue;
    }
    for (const key of Object.keys(entry)) {
      if (!PROVIDER_KEYS.includes(key)) {
        errors.push(`${at}.${key}: unknown option (use ${PROVIDER_KEYS.join(", ")})`);
      }
    }
    if (typeof entry.url !== "string" || !/^https?:\/\/[A-Za-z0-9_\-./:@%+=,~]+$/.test(entry.url)) {
      errors.push(`${at}.url: expected an http(s) URL without spaces, quotes or $`);
    }
    const token = entry.tokenSecret;
    if (token !== undefined && !(typeof token === "string" && ENV_NAME_PATTERN.test(token))) {
      errors.push(
        `${at}.tokenSecret: expected an environment variable name such as IBM_QUANTUM_TOKEN`,
      );
    }
    const fallback = entry.fallback;
    if (fallback !== undefined) {
      if (!(typeof fallback === "string" && /^[a-z][a-z0-9-]*$/.test(fallback))) {
        errors.push(`${at}.fallback: expected a resource name such as quantum-sim`);
      } else if (!dependsOn.includes(fallback)) {
        errors.push(`${at}.fallback: list ${fallback} in dependsOn too, so it starts first`);
      }
    }
    if (entry.required !== undefined && typeof entry.required !== "boolean") {
      errors.push(`${at}.required: expected true or false`);
    } else if (entry.required === true && token === undefined) {
      errors.push(`${at}.required: needs a tokenSecret`);
    }
  }
  return errors;
}
