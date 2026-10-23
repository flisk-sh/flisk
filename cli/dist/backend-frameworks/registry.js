// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { resolveAgentRuntime } from "../agent-runtimes/registry.js";
import { getBackendIndexTemplate } from "../backend-languages/bun.js";
import { BACKEND_LANGUAGES, getBackendLanguage } from "../backend-languages/registry.js";
import { TdkError } from "../utils/errors.js";
import { elysiaBackendProvider } from "./elysia.js";
import { expressBackendProvider } from "./express.js";
import { fastifyBackendProvider } from "./fastify.js";
import { h3BackendProvider } from "./h3.js";
import { koaBackendProvider } from "./koa.js";
import { mcpBackendProvider } from "./mcp.js";
import { nestBackendProvider } from "./nestjs.js";
/** Hono is the historical default; omitting --framework keeps the exact historical output. */
export const DEFAULT_BACKEND_FRAMEWORK = "hono";
export const honoBackendProvider = {
    id: "hono",
    label: "Bun + Hono",
    dependencies: { hono: "^4.0.0" },
    devDependencies: {},
    createIndex: getBackendIndexTemplate,
};
export const BACKEND_FRAMEWORKS = {
    hono: honoBackendProvider,
    express: expressBackendProvider,
    elysia: elysiaBackendProvider,
    fastify: fastifyBackendProvider,
    h3: h3BackendProvider,
    koa: koaBackendProvider,
    nestjs: nestBackendProvider,
};
/**
 * The languages a framework can be combined with, decided by the same validation the resource command
 * uses: a language that owns its runtime (python, go, rust, node) cannot be combined with a framework.
 */
function compatibleLanguages(frameworkId) {
    return Object.keys(BACKEND_LANGUAGES).filter((languageId) => {
        try {
            resolveBackendFramework("backend", frameworkId, BACKEND_LANGUAGES[languageId]);
            return true;
        }
        catch (error) {
            // Only the "a language that owns its runtime cannot be combined with a framework" rule is
            // expected here. Any other error is a bug and must surface instead of silently shrinking
            // the language column.
            if (error instanceof TdkError)
                return false;
            throw error;
        }
    });
}
/**
 * Lists the registered backend frameworks with the language (and runtime) they are scaffolded with, so
 * `flisk resource --type backend --frameworks` is the whole backend discovery surface.
 *
 * `languageId` is the language the listing is judged against; the default Bun language is used when it
 * is omitted. A language that was asked for is named in the printed command, so copying a row never
 * scaffolds a different language than the one the listing was about.
 */
export function listBackendFrameworks(languageId) {
    const requested = getBackendLanguage(languageId);
    const namesLanguage = languageId !== undefined;
    return Object.entries(BACKEND_FRAMEWORKS).map(([id, provider]) => {
        const languages = compatibleLanguages(id);
        const compatible = languages.includes(requested.id);
        const languageFlag = namesLanguage ? ` --language ${requested.id}` : "";
        // A language that owns its runtime cannot be combined with a framework, so the row carries the
        // command that creates the resource in that language, without a framework.
        const command = compatible
            ? `flisk resource <name> --type backend --framework ${id}${languageFlag}`
            : `flisk resource <name> --type backend${languageFlag}`;
        return {
            id,
            label: provider.label,
            languages,
            compatible,
            command,
        };
    });
}
export function getBackendFramework(frameworkId) {
    const id = (frameworkId ?? DEFAULT_BACKEND_FRAMEWORK).trim().toLowerCase();
    const provider = Object.hasOwn(BACKEND_FRAMEWORKS, id) ? BACKEND_FRAMEWORKS[id] : undefined;
    if (!provider) {
        const supportedIds = Object.keys(BACKEND_FRAMEWORKS).join(", ");
        throw new TdkError(`Unknown backend framework "${frameworkId}". Supported frameworks: ${supportedIds}.`, [`Use one of: ${supportedIds}`, `Omit --framework to use ${DEFAULT_BACKEND_FRAMEWORK}`]);
    }
    return provider;
}
/**
 * Returns the provider for an explicit `--framework` on a backend, or undefined when none was given
 * (the historical Hono scaffold). Python owns its runtime, so a framework cannot be combined with it.
 */
export function resolveBackendFramework(resourceType, frameworkId, language) {
    // `mcp` is a resource type with one fixed scaffold, so a framework choice does not apply to it.
    if (resourceType === "mcp") {
        if (frameworkId !== undefined) {
            throw new TdkError("--framework cannot be combined with --type mcp.", [
                "An mcp resource always scaffolds a Model Context Protocol server",
                "Drop --framework, or use --type backend --framework <id>",
            ]);
        }
        if (language?.createFiles) {
            throw new TdkError(`--language ${language.id} cannot be combined with --type mcp.`, [
                "An mcp resource is a Bun service; drop --language",
            ]);
        }
        return mcpBackendProvider;
    }
    // `agent` is scaffolded by an agent runtime (src/agent-runtimes/), not a framework. Only the default runtime is reachable here:
    // `flisk resource` validates --runtime before it scaffolds, so the package.json and tsconfig always match the chosen runtime.
    if (resourceType === "agent") {
        if (frameworkId !== undefined && frameworkId !== "custom") {
            throw new TdkError("--framework cannot be combined with --type agent.", [
                "An agent resource is scaffolded by an agent runtime; use --runtime <id> instead",
            ]);
        }
        if (language?.createFiles) {
            throw new TdkError(`--language ${language.id} cannot be combined with --type agent.`, [
                "An agent resource is a Bun service; drop --language",
            ]);
        }
        return resolveAgentRuntime();
    }
    if (resourceType !== "backend" || frameworkId === undefined)
        return undefined;
    if (language?.createFiles) {
        throw new TdkError(`--framework cannot be combined with --language ${language.id}.`, [
            `The ${language.id} provider owns its runtime and framework`,
            "Drop --framework, or use --language bun",
        ]);
    }
    return getBackendFramework(frameworkId);
}
