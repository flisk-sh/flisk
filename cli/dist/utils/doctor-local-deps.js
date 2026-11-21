// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { getBackendLanguage } from "../backend-languages/registry.js";
import { shellQuote } from "./native-container.js";
import { declaresCommand } from "./native-service.js";
import { findProjectRoot } from "./paths.js";
import { discoverResourcesFromRoot } from "./services.js";
/** The install hint of a language without the "# optional: Docker builds the image" note. */
function installCommandOf(language) {
    const hint = getBackendLanguage(language).installHint;
    return hint.split("#")[0]?.trim() ?? hint;
}
/** The dependency directory and exact command for one local service, or null when the language needs none locally. */
function dependencyKind(resource, exists) {
    const raw = resource.config?.language;
    const language = typeof raw === "string" ? raw.trim().toLowerCase() : undefined;
    if (language === "python") {
        const pip = installCommandOf("python").replace(/^pip\b/, ".venv/bin/pip");
        return { dir: ".venv", installCommand: `python3 -m venv .venv && ${pip}` };
    }
    if (language === "node" || language === "bun") {
        return { dir: "node_modules", installCommand: installCommandOf(language) };
    }
    if (language)
        return null;
    // A hand-written service.json need not name a language: the files it holds say what its command imports.
    if (exists(join(resource.path, "package.json"))) {
        return { dir: "node_modules", installCommand: installCommandOf("node") };
    }
    if (exists(join(resource.path, "pyproject.toml")) ||
        exists(join(resource.path, "requirements.txt"))) {
        const pip = installCommandOf("python").replace(/^pip\b/, ".venv/bin/pip");
        return { dir: ".venv", installCommand: `python3 -m venv .venv && ${pip}` };
    }
    return null;
}
/**
 * The local-process services whose dependencies are missing. Installs may be hoisted at the project root, so a dependency
 * directory in either the service folder or the project root counts as present.
 */
export function findMissingLocalServiceDeps(projectRoot, resources, exists = existsSync) {
    const findings = [];
    for (const resource of resources) {
        if (!declaresCommand(resource.config))
            continue;
        const kind = dependencyKind(resource, exists);
        if (!kind)
            continue;
        const installed = exists(join(resource.path, kind.dir)) || exists(join(projectRoot, kind.dir));
        if (installed)
            continue;
        const path = relative(projectRoot, resource.path).split(sep).join("/") || resource.name;
        findings.push({
            service: resource.name,
            path,
            missing: kind.dir,
            installCommand: kind.installCommand,
        });
    }
    return findings;
}
export function checkLocalServiceDependencies(projectRoot = findProjectRoot() ?? process.cwd(), resources = discoverResourcesFromRoot(projectRoot), exists = existsSync) {
    const findings = findMissingLocalServiceDeps(projectRoot, resources, exists);
    if (findings.length === 0) {
        return {
            name: "Local service dependencies",
            didPass: true,
            message: "Every local-process service has its dependencies installed",
        };
    }
    return {
        name: "Local service dependencies",
        didPass: false,
        message: findings
            .map((finding) => `${finding.service}: missing ${finding.missing} - run \`${finding.installCommand}\` in ${finding.path}`)
            .join("\n    "),
        fix: findings.map((finding) => `cd ${finding.path} && ${finding.installCommand}`).join("\n  "),
        observed: { kind: "local-service-deps", findings },
    };
}
const listGitWorktrees = (cwd) => execFileSync("git", ["worktree", "list", "--porcelain"], {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5000,
});
/** Paths from `git worktree list --porcelain`, skipping the current one and prunable (missing) checkouts. */
export function parseWorktreePaths(raw, projectRoot) {
    const paths = [];
    let current = null;
    let prunable = false;
    const flush = () => {
        if (current && !prunable && resolve(current) !== resolve(projectRoot))
            paths.push(current);
    };
    for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith("worktree ")) {
            flush();
            current = line.slice("worktree ".length).trim();
            prunable = false;
        }
        else if (current && line.trim() === "prunable") {
            prunable = true;
        }
    }
    flush();
    return paths.sort();
}
function copyEnvCommand(source, target, platform) {
    if (platform === "win32") {
        // Windows file names cannot contain a double quote, and cmd treats backslashes literally inside quotes.
        const quote = (path) => `"${path}"`;
        return `copy /Y ${quote(source)} ${quote(target)}`;
    }
    return `cp ${shellQuote(source)} ${shellQuote(target)}`;
}
/**
 * Points at another worktree's `.env` when this worktree has none. The file is never copied: the command is for the user to
 * run, because an env file is per-worktree and may hold worktree-specific credentials.
 */
export function findWorktreeEnvHint(projectRoot, options = {}) {
    const exists = options.exists ?? existsSync;
    const target = join(projectRoot, ".env");
    if (exists(target))
        return null;
    let raw;
    try {
        raw = (options.listWorktrees ?? listGitWorktrees)(projectRoot);
    }
    catch {
        return null;
    }
    for (const worktree of parseWorktreePaths(raw, projectRoot)) {
        const source = join(worktree, ".env");
        if (!exists(source))
            continue;
        return {
            source,
            target,
            copyCommand: copyEnvCommand(source, target, options.platform ?? process.platform),
        };
    }
    return null;
}
export function checkWorktreeEnv(projectRoot = findProjectRoot() ?? process.cwd(), options = {}) {
    const hint = findWorktreeEnvHint(projectRoot, options);
    if (!hint) {
        return {
            name: "Worktree .env",
            didPass: true,
            isSkipped: true,
            message: "No copyable .env found in another git worktree",
        };
    }
    return {
        name: "Worktree .env",
        didPass: true,
        isWarning: true,
        message: `This worktree has no .env, but another worktree has one: ${hint.source}`,
        fix: hint.copyCommand,
        observed: { kind: "env-copy", ...hint },
    };
}
/** The same hint `flisk up` prints before a local-process run reads the project .env. */
export function worktreeEnvHintMessage(projectRoot) {
    const hint = findWorktreeEnvHint(projectRoot);
    if (!hint)
        return null;
    return `This worktree has no .env, but ${hint.source} does. Copy it if this worktree needs the same values:\n  ${hint.copyCommand}`;
}
