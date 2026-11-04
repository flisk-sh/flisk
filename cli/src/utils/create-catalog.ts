// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

/**
 * What `flisk create` can offer, read from Flisk's own generators.
 *
 * Nothing here names a framework, language, starter or resource type to offer: every option comes from the registries that
 * `flisk resource` and `flisk project` already use (frontend and backend providers, backend languages, project templates,
 * creatable resource types and infrastructure presets). A generator added to a registry shows up in `flisk create` with no
 * edit here, and this file never has to be kept in step with them.
 */

import {
  DEFAULT_BACKEND_FRAMEWORK,
  listBackendFrameworks,
} from "../backend-frameworks/registry.js";
import { BACKEND_LANGUAGES, DEFAULT_BACKEND_LANGUAGE } from "../backend-languages/registry.js";
import { LOCAL_FRONTEND_REQUIRES } from "../frontend-frameworks/local.js";
import {
  DEFAULT_FRONTEND_FRAMEWORK,
  FRONTEND_FRAMEWORKS,
} from "../frontend-frameworks/registry.js";
import {
  CREATABLE_RESOURCE_TYPES,
  DATABASE_RESOURCE_TYPE,
  QUEUE_RESOURCE_TYPE,
} from "../types/index.js";
import { BRING_YOUR_OWN_TYPE } from "./constants.js";
import { frameworksOfType, INFRA_PRESETS } from "./infra-presets.js";
import { PROJECT_TEMPLATES } from "./project-templates.js";

/** One thing a menu can offer. */
export interface CatalogOption {
  id: string;
  title: string;
  hint: string;
  /** Runs on the host with no Docker or Tilt. False means the Docker route only. */
  local: boolean;
}

/** The frontend frameworks, the registry's default first. */
export function frontendCatalog(): CatalogOption[] {
  const options = Object.values(FRONTEND_FRAMEWORKS).map((provider) => ({
    id: provider.id,
    title: provider.label,
    hint: provider.kind === "server" ? "runs its own dev server" : "Vite",
    // A server framework runs its own dev server on the host; a Vite one needs its plugin setup declared.
    local: provider.kind === "server" || provider.vite !== undefined,
  }));
  return defaultFirst(options, DEFAULT_FRONTEND_FRAMEWORK);
}

export interface LanguageOption extends CatalogOption {
  /** The backend frameworks this language can be combined with; empty when the language owns its runtime. */
  frameworks: CatalogOption[];
}

/** The backend languages, each with the frameworks it can be combined with, the registry's default first. */
export function backendCatalog(): LanguageOption[] {
  const frameworks = listBackendFrameworks();
  const options = Object.values(BACKEND_LANGUAGES).map((language) => ({
    id: language.id,
    title: language.label,
    // What the language needs on the host: its dev command's program, or its own id for the shared scaffold.
    hint: `needs ${localRequirements({ frontend: false, language: language.id }).join(", ")}`,
    local: true,
    frameworks: defaultFirst(
      frameworks
        .filter((entry) => entry.languages.includes(language.id))
        .map((entry) => ({ id: entry.id, title: entry.label, hint: "", local: true })),
      DEFAULT_BACKEND_FRAMEWORK,
    ),
  }));
  return defaultFirst(options, DEFAULT_BACKEND_LANGUAGE);
}

/**
 * A starter's menu row in plain words: the description's lead (a "Name: what it does" description)
 * becomes the title and the rest the hint, so nobody has to know the internal id.
 */
export function plainStarterText(id: string, description: string): { title: string; hint: string } {
  const colon = description.indexOf(": ");
  if (colon > 0 && colon <= 40) {
    return { title: description.slice(0, colon), hint: description.slice(colon + 2) };
  }
  return { title: id, hint: description };
}

/** The ready-made starter projects. A starter the CLI writes itself (`generated`) runs as local processes. */
export function starterCatalog(): CatalogOption[] {
  return Object.entries(PROJECT_TEMPLATES).map(([key, template]) => ({
    id: key,
    ...plainStarterText(key, template.description),
    local: template.generated !== undefined,
  }));
}

export interface ExtraOption {
  /** `type` or `type:framework`, the shape `--extras` takes. */
  id: string;
  type: string;
  framework?: string;
  title: string;
  hint: string;
}

/**
 * Extra parts a project can add on the Docker route: the creatable resource types that are not the website or the API, and
 * every framework of the infrastructure types (queues, databases).
 */
export function extraCatalog(): ExtraOption[] {
  const infra = [QUEUE_RESOURCE_TYPE, DATABASE_RESOURCE_TYPE].flatMap((type) =>
    frameworksOfType(type).map((framework) => {
      const preset = INFRA_PRESETS[framework as keyof typeof INFRA_PRESETS];
      return {
        id: `${type}:${framework}`,
        type,
        framework,
        title: framework,
        hint: preset?.description ?? type,
      };
    }),
  );
  const own = CREATABLE_RESOURCE_TYPES.filter(
    (type) => !isAppPart(type) && type !== BRING_YOUR_OWN_TYPE,
  ).map((type) => ({ id: type, type, title: type, hint: `a ${type} resource` }));
  return [...own, ...infra];
}

/** The two parts every app is built from; everything else is an extra. */
function isAppPart(type: string): boolean {
  return Object.hasOwn(APP_PARTS, type);
}
const APP_PARTS = { frontend: true, backend: true } as const;

/** The programs a local project needs on the host, read from the generators it was built with. */
export function localRequirements(parts: { frontend: boolean; language?: string }): string[] {
  const programs = new Set<string>();
  if (parts.frontend) for (const program of LOCAL_FRONTEND_REQUIRES) programs.add(program);
  if (parts.language) {
    const provider = BACKEND_LANGUAGES[parts.language];
    // A language that owns its runtime names the program in its dev command; the shared scaffold runs on its own id.
    programs.add(provider?.devCommand?.split(" ")[0] ?? parts.language);
  }
  return [...programs];
}

function defaultFirst<T extends { id: string }>(options: T[], defaultId: string): T[] {
  return [...options].sort((a, b) => Number(b.id === defaultId) - Number(a.id === defaultId));
}
