// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { TdkError } from "../utils/errors.js";
import { litFrontendProvider } from "./lit.js";
import { preactFrontendProvider } from "./preact.js";
import { qwikFrontendProvider } from "./qwik.js";
import { reactFrontendProvider } from "./react.js";
import { solidFrontendProvider } from "./solid.js";
import { svelteFrontendProvider } from "./svelte.js";
import { tanstackRouterFrontendProvider } from "./tanstack-router.js";
import type { FrontendFrameworkProvider } from "./types.js";
import { vanillaFrontendProvider } from "./vanilla.js";
import { vueFrontendProvider } from "./vue.js";

export const DEFAULT_FRONTEND_FRAMEWORK = "react";

export const FRONTEND_FRAMEWORKS: Record<string, FrontendFrameworkProvider> = {
  react: reactFrontendProvider,
  vue: vueFrontendProvider,
  svelte: svelteFrontendProvider,
  preact: preactFrontendProvider,
  lit: litFrontendProvider,
  solid: solidFrontendProvider,
  qwik: qwikFrontendProvider,
  vanilla: vanillaFrontendProvider,
  "tanstack-router": tanstackRouterFrontendProvider,
};

// Frameworks that own their own server or build config. They are never scaffolded as Vite SPA providers; they go through
// `tdk resource <name> --type bring-your-own` instead.
export const META_FRAMEWORK_IDS = [
  "next",
  "nuxt",
  "sveltekit",
  "astro",
  "angular",
  "remix",
  "tanstack-start",
] as const;

// Providers that have passed the resource-types/frontend e2e suite (one leg per framework, see tests/e2e/axes.json).
export const VERIFIED_FRONTEND_FRAMEWORKS: readonly string[] = [
  "react",
  "vue",
  "svelte",
  "preact",
  "lit",
  "solid",
  "qwik",
  "vanilla",
  "tanstack-router",
];

export interface FrontendFrameworkInventoryEntry {
  id: string;
  label: string;
  kind: "vite-spa";
  verified: boolean;
  command: string;
}

export function listFrontendFrameworks(): FrontendFrameworkInventoryEntry[] {
  return Object.entries(FRONTEND_FRAMEWORKS).map(([id, provider]) => ({
    id,
    label: provider.label,
    kind: "vite-spa",
    verified: VERIFIED_FRONTEND_FRAMEWORKS.includes(id),
    command: `tdk resource <name> --type frontend --framework ${id}`,
  }));
}

export function getFrontendFramework(
  frameworkId?: string,
  resourceName?: string,
): FrontendFrameworkProvider {
  const id = (frameworkId ?? DEFAULT_FRONTEND_FRAMEWORK).trim().toLowerCase();
  const provider = Object.hasOwn(FRONTEND_FRAMEWORKS, id) ? FRONTEND_FRAMEWORKS[id] : undefined;

  if (!provider) {
    const supportedIds = Object.keys(FRONTEND_FRAMEWORKS).join(", ");
    const isMeta = (META_FRAMEWORK_IDS as readonly string[]).includes(id);
    const byo = `tdk resource ${resourceName ?? "<name>"} --type bring-your-own`;
    throw new TdkError(
      `${isMeta ? `"${frameworkId}" is not a Vite SPA provider` : `Unknown frontend framework "${frameworkId}"`}. Supported frameworks: ${supportedIds}.`,
      [
        `Use one of: ${supportedIds}`,
        `Omit --framework to use ${DEFAULT_FRONTEND_FRAMEWORK}`,
        ...(isMeta ? [`Create the app with ${id}'s own CLI, then register it: ${byo}`] : []),
      ],
    );
  }

  return provider;
}

export function resolveFrontendFramework(
  resourceType: string,
  frameworkId?: string,
  resourceName?: string,
): FrontendFrameworkProvider | undefined {
  if (resourceType !== "frontend") {
    // Backends take their own framework ids (see backend-frameworks/registry.ts).
    if (frameworkId !== undefined && resourceType !== "backend") {
      throw new TdkError("--framework can only be used with --type frontend or --type backend.", [
        "Add --type frontend or --type backend, or drop --framework for this resource type",
      ]);
    }
    return undefined;
  }

  return getFrontendFramework(frameworkId, resourceName);
}
