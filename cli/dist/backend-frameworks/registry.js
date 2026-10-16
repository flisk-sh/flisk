// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { resolveAgentRuntime } from "../agent-runtimes/registry.js";
import { getBackendIndexTemplate } from "../backend-languages/bun.js";
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
    // `tdk resource` validates --runtime before it scaffolds, so the package.json and tsconfig always match the chosen runtime.
    if (resourceType === "agent") {
        if (frameworkId !== undefined) {
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
