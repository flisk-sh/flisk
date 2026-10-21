// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { TdkError } from "../utils/errors.js";
import { bunBackendProvider } from "./bun.js";
import { goBackendProvider } from "./go.js";
import { nodeBackendProvider } from "./node.js";
import { pythonBackendProvider } from "./python.js";
import { rustBackendProvider } from "./rust.js";
import type { BackendLanguageProvider } from "./types.js";

export const DEFAULT_BACKEND_LANGUAGE = "bun";

export const BACKEND_LANGUAGES: Record<string, BackendLanguageProvider> = {
  bun: bunBackendProvider,
  python: pythonBackendProvider,
  go: goBackendProvider,
  rust: rustBackendProvider,
  node: nodeBackendProvider,
};

export function getBackendLanguage(languageId?: string): BackendLanguageProvider {
  const id = (languageId ?? DEFAULT_BACKEND_LANGUAGE).trim().toLowerCase();
  const provider = Object.hasOwn(BACKEND_LANGUAGES, id) ? BACKEND_LANGUAGES[id] : undefined;

  if (!provider) {
    const supportedIds = Object.keys(BACKEND_LANGUAGES).join(", ");
    throw new TdkError(
      `Unknown backend language "${languageId}". Supported languages: ${supportedIds}.`,
      [`Use one of: ${supportedIds}`, `Omit --language to use ${DEFAULT_BACKEND_LANGUAGE}`],
    );
  }

  return provider;
}

/** Returns the provider for a backend, or undefined for other types. Rejects --language elsewhere. */
export function resolveBackendLanguage(
  resourceType: string,
  languageId?: string,
): BackendLanguageProvider | undefined {
  if (resourceType !== "backend") {
    if (languageId !== undefined) {
      throw new TdkError("--language can only be used with --type backend.", [
        "Add --type backend, or drop --language for this resource type",
      ]);
    }
    return undefined;
  }

  return getBackendLanguage(languageId);
}
