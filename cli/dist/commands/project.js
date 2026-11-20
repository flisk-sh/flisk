// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, win32 } from "node:path";
import { cwd, execPath } from "node:process";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { Command } from "commander";
import { generateMasterConfigs, readProjectConfig } from "../generator/template-engine.js";
import { installAgentSkills } from "../utils/agent-skills.js";
import { addYesOption } from "../utils/command-helpers.js";
import { MASTER_CONFIG_FILES, PROJECT_JSON } from "../utils/constants.js";
import { clearDiscoveryCache } from "../utils/discovery-context.js";
import { completeEnvFile, ensureEnvFile, validateEnvFile } from "../utils/env-validator.js";
import { errorFactories, FliskError, runCommand, showErrorAndExit } from "../utils/errors.js";
import { ensureDirectory, ensureGitignore, writeJsonFile } from "../utils/file-helpers.js";
import { showCancelled, showCommandHeader, showDetail, showStep, showSuccess, } from "../utils/formatting.js";
import { runJsonCommand } from "../utils/json-command.js";
import { writeLanggraphProject } from "../utils/langgraph-template.js";
import { createMachineEnvelope } from "../utils/machine-output.js";
import { writeNextPostgresProject } from "../utils/next-postgres-template.js";
import { LOCKFILE_COMMAND } from "../utils/npm-lockfile.js";
import { findProjectRoot } from "../utils/paths.js";
import { PROJECT_FEATURES } from "../utils/project-features.js";
import { listProjectTemplates, PROJECT_TEMPLATES, resolveBundledTemplateDir, templateGitCommands, templateTargetDir, } from "../utils/project-templates.js";
import { promptConfirm, promptMultiSelect, promptText } from "../utils/prompt.js";
import { writeSecurityProject } from "../utils/security-template.js";
import { discoverStackNames } from "../utils/services.js";
import { suggestClosest } from "../utils/suggestions.js";
import { writeSuperAgentProject } from "../utils/super-agent-template.js";
import { writeSwarmProject } from "../utils/swarm-template.js";
import { writeToolLoopProject } from "../utils/tool-loop-template.js";
import { deriveProjectName, isTargetDirSafe, validateProjectName } from "../utils/validation.js";
/**
 * Stack names discovered from service.json files already in the repo (e.g. a
 * cloned starter template). Tilt's discovery groups app resources by this
 * same `stack` field, so a stack must appear here to ever be enabled by
 * `should_enable()` - without it, `flisk up` would launch infra only and no
 * app services would come up, however many the repo actually has.
 */
function discoverExistingServiceStacks(projectRoot, resources) {
    try {
        return discoverStackNames(projectRoot, resources);
    }
    catch {
        return [];
    }
}
function getAssignedStackServices(projectConfig) {
    return new Set([
        ...projectConfig.phases.pre_alpha.enabledStacks,
        ...projectConfig.phases.alpha.enabledStacks,
        ...projectConfig.phases.beta.enabledStacks,
        ...projectConfig.phases.out_of_scope.enabledStacks,
    ]);
}
function syncDiscoveredStacksToPreAlpha(projectConfig, discoveredStacks) {
    const assignedServices = getAssignedStackServices(projectConfig);
    const missingStacks = discoveredStacks.filter((stack) => !assignedServices.has(stack));
    if (missingStacks.length === 0) {
        projectConfig.phases.pre_alpha.enabledStacks = Array.from(new Set(projectConfig.phases.pre_alpha.enabledStacks));
        return [];
    }
    projectConfig.phases.pre_alpha.enabledStacks = Array.from(new Set([...projectConfig.phases.pre_alpha.enabledStacks, ...missingStacks]));
    return missingStacks;
}
/**
 * Adds stacks that have service.json files but aren't in any phase to
 * pre_alpha, so a resource scaffolded after `flisk project` is picked up by
 * `flisk up` without re-running `flisk project`. Returns the stacks it enabled.
 */
export function enableDiscoveredStacks(projectRoot, resources) {
    const projectJsonPath = join(projectRoot, ".flisk", PROJECT_JSON);
    if (!existsSync(projectJsonPath))
        return [];
    const projectConfig = readProjectConfig(projectRoot);
    const enabled = syncDiscoveredStacksToPreAlpha(projectConfig, discoverExistingServiceStacks(projectRoot, resources));
    if (enabled.length > 0) {
        writeJsonFile(projectJsonPath, projectConfig);
    }
    return enabled;
}
/**
 * Get core infrastructure services from PROJECT_FEATURES that are enabled by default
 */
function getDefaultCoreServices() {
    return Object.values(PROJECT_FEATURES)
        .filter((f) => f.enabled_by_default && f.category === "core")
        .map((f) => f.name);
}
/** The last non-empty line of a child process error, for a one-line failure message. */
export function lastLine(text) {
    const lines = text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    return lines.pop() ?? "unknown error";
}
export const ACTION_WORD_HINTS = {
    validate: "flisk project --check",
    check: "flisk project --check",
    verify: "flisk project --check",
    info: "flisk info",
    list: "flisk resources",
    status: "flisk status",
};
/** Looks up an action word's hint; own keys only, so `constructor` and `__proto__` never match. */
export function actionWordHint(word) {
    const key = word.toLowerCase();
    return Object.hasOwn(ACTION_WORD_HINTS, key) ? ACTION_WORD_HINTS[key] : undefined;
}
/** Refuses an unknown starter name: prints the error and the catalog, then exits non-zero. */
export function exitUnknownTemplate(templateName) {
    const actionHint = actionWordHint(templateName);
    if (actionHint) {
        console.log(chalk.yellow(`\nDid you mean "${actionHint}"?`));
    }
    else {
        const closest = suggestClosest(templateName, Object.keys(PROJECT_TEMPLATES));
        if (closest) {
            console.log(chalk.yellow(`\nDid you mean "${closest}"?`));
        }
    }
    console.log(chalk.red(`\n❌ Unknown template: "${templateName}"`));
    console.log(chalk.yellow("\nAvailable templates:"));
    for (const [name, info] of Object.entries(PROJECT_TEMPLATES)) {
        console.log(`  ${chalk.cyan(name)} ${chalk.gray(`- ${info.description}`)}`);
    }
    console.log(chalk.gray("\nOr run `flisk project` with no template for a blank project."));
    process.exit(1);
}
const SAFE_WIN32_CD_RE = /^[A-Za-z0-9_.:\\/][A-Za-z0-9_.:\\/-]*$/;
const SAFE_POSIX_CD_RE = /^[A-Za-z0-9_./][A-Za-z0-9_./-]*$/;
function escapeCmdTarget(raw, delayedExpansion) {
    if (SAFE_WIN32_CD_RE.test(raw))
        return raw;
    // In cmd.exe (/v:off), `%` expands even inside quotes so `%` is escaped outside quotes as `^%`,
    // while `!` and `^` remain literal inside quotes. When delayed expansion (/v:on) is enabled and
    // `!` is present, cmd parses carets twice: phase 2 consumes one caret outside quotes before phase 3
    // runs `!` expansion, so `^^^!` (-> `^!` -> `!`) and `^^^^` (-> `^^` -> `^`) stay outside quotes.
    const useDelayedBangEscaping = delayedExpansion && raw.includes("!");
    const specialRe = useDelayedBangEscaping ? /([%!^])/ : /([%])/;
    if (!specialRe.test(raw))
        return `"${raw.replace(/"/g, '""')}"`;
    return raw
        .split(specialRe)
        .filter((part) => part.length > 0)
        .map((part) => {
        if (part === "%")
            return "^%";
        if (useDelayedBangEscaping && part === "!")
            return "^^^!";
        if (useDelayedBangEscaping && part === "^")
            return "^^^^";
        return /^[A-Za-z0-9_.:\\/-]+$/.test(part) ? part : `"${part.replace(/"/g, '""')}"`;
    })
        .join("");
}
function escapePowerShellCdCommand(raw) {
    if (SAFE_WIN32_CD_RE.test(raw))
        return `cd ${raw}`;
    // Single quotes disable `$` and backtick expansion; `-LiteralPath` disables wildcard globbing (`[ ]`, `*`, `?`).
    return `Set-Location -LiteralPath '${raw.replace(/'/g, "''")}'`;
}
function resolveWindowsShell(env, shell) {
    const explicit = shell !== "auto"
        ? shell
        : env.FLISK_SHELL === "cmd" ||
            env.FLISK_SHELL === "cmd-delayed" ||
            env.FLISK_SHELL === "powershell" ||
            env.FLISK_SHELL === "posix"
            ? env.FLISK_SHELL
            : "auto";
    if (explicit !== "auto")
        return explicit;
    const hasPrompt = Boolean(env.PROMPT);
    const hasPwsh = Boolean(env.POWERSHELL_DISTRIBUTION_CHANNEL);
    const hasMsystem = Boolean(env.MSYSTEM);
    // Windows PowerShell 5.1 (`powershell.exe`) inherits `PROMPT` when launched from CMD and never
    // sets `POWERSHELL_DISTRIBUTION_CHANNEL`, while a nested `cmd.exe` from `pwsh` or Git Bash can
    // inherit parent shell variables. Only unnested `pwsh` or `MSYSTEM` (Git Bash) is unambiguous.
    if (hasPwsh && !hasPrompt && !hasMsystem)
        return "powershell";
    if (hasMsystem && !hasPrompt && !hasPwsh)
        return "posix";
    return "ambiguous";
}
/** Formats the created folder label and shell-safe `cd` next-step command(s) for the current OS and shell. */
export function formatProjectPaths(dirName, platform = process.platform, env = process.env, shell = "auto", workingDir = cwd()) {
    const trailingSep = platform === "win32" ? /[\\/]+$/ : /\/+$/;
    const displayDir = platform === "win32" && /^[A-Za-z]:[\\/]+$/.test(dirName)
        ? `${dirName[0]}:\\`
        : dirName.length > 1
            ? dirName.replace(trailingSep, "") || dirName
            : dirName;
    const endsWithSep = displayDir.endsWith("/") || (platform === "win32" && displayDir.endsWith("\\"));
    const displayDirWithSlash = endsWithSep ? displayDir : `${displayDir}/`;
    const rawCdTarget = displayDir.startsWith("-")
        ? `${platform === "win32" ? ".\\" : "./"}${displayDir}`
        : displayDir;
    const isUncTarget = platform === "win32" && /^(\\\\|\/\/)/.test(rawCdTarget);
    const hasWinDrive = platform === "win32" && /^[A-Za-z]:/.test(rawCdTarget);
    const isSlashRooted = platform === "win32" && rawCdTarget.startsWith("/") && !isUncTarget;
    const isBackslashRooted = platform === "win32" && rawCdTarget.startsWith("\\") && !isUncTarget;
    const hasWinWorkingDirRoot = platform === "win32" && (/^[A-Za-z]:/.test(workingDir) || /^(\\\\|\/\/)/.test(workingDir));
    const resolvedWinRooted = (isSlashRooted || isBackslashRooted) && hasWinWorkingDirRoot
        ? win32.resolve(workingDir.replace(/\//g, "\\"), rawCdTarget)
        : null;
    const bashRawTarget = resolvedWinRooted ? resolvedWinRooted.replace(/\\/g, "/") : rawCdTarget;
    const isSafeBashTarget = resolvedWinRooted
        ? /^(?:[A-Za-z]:)?[A-Za-z0-9_./][A-Za-z0-9_./-]*$/.test(bashRawTarget)
        : SAFE_POSIX_CD_RE.test(bashRawTarget);
    const posixCdTarget = isSafeBashTarget
        ? bashRawTarget
        : `'${bashRawTarget.replace(/'/g, "'\\''")}'`;
    const posixCdCmd = `cd ${posixCdTarget}`;
    const detectedWinShell = platform === "win32" ? resolveWindowsShell(env, shell) : "posix";
    if (platform === "win32" && detectedWinShell !== "posix") {
        const isRelativeWinTarget = !hasWinDrive && !isUncTarget && !isSlashRooted && !isBackslashRooted;
        let cmdRawTarget = rawCdTarget;
        if (isUncTarget) {
            cmdRawTarget = rawCdTarget.replace(/\//g, "\\");
        }
        else if (resolvedWinRooted) {
            cmdRawTarget = resolvedWinRooted;
        }
        else if (isSlashRooted) {
            cmdRawTarget = rawCdTarget.replace(/\//g, "\\");
        }
        const isCmdUnc = /^\\\\/.test(cmdRawTarget);
        const hasCmdDrive = /^[A-Za-z]:/.test(cmdRawTarget);
        const isCharSafe = SAFE_WIN32_CD_RE.test(rawCdTarget);
        const hasBang = cmdRawTarget.includes("!");
        const formatCmd = (target) => isCmdUnc ? `pushd ${target}` : hasCmdDrive ? `cd /d ${target}` : `cd ${target}`;
        const cmdOffTarget = escapeCmdTarget(cmdRawTarget, false);
        const cmdOnTarget = escapeCmdTarget(cmdRawTarget, true);
        const cmdOffCmd = formatCmd(cmdOffTarget);
        const cmdOnCmd = formatCmd(cmdOnTarget);
        const psCmd = escapePowerShellCdCommand(rawCdTarget);
        const psTarget = isCharSafe ? rawCdTarget : `'${rawCdTarget.replace(/'/g, "''")}'`;
        if (detectedWinShell === "powershell") {
            return { displayDirWithSlash, cdTarget: psTarget, cdCommands: [psCmd] };
        }
        if (detectedWinShell === "cmd-delayed") {
            return { displayDirWithSlash, cdTarget: cmdOnTarget, cdCommands: [cmdOnCmd] };
        }
        if (detectedWinShell === "cmd") {
            return {
                displayDirWithSlash,
                cdTarget: cmdOffTarget,
                cdCommands: hasBang
                    ? [`cmd.exe:         ${cmdOffCmd}`, `cmd.exe (/v:on): ${cmdOnCmd}`]
                    : [cmdOffCmd],
            };
        }
        if (isCharSafe && isRelativeWinTarget && !rawCdTarget.includes("\\")) {
            return { displayDirWithSlash, cdTarget: rawCdTarget, cdCommands: [`cd ${rawCdTarget}`] };
        }
        return {
            displayDirWithSlash,
            cdTarget: cmdOffTarget,
            cdCommands: hasBang
                ? [
                    `cmd.exe:         ${cmdOffCmd}`,
                    `cmd.exe (/v:on): ${cmdOnCmd}`,
                    `PowerShell:      ${psCmd}`,
                    `Git Bash:        ${posixCdCmd}`,
                ]
                : [`cmd.exe:    ${cmdOffCmd}`, `PowerShell: ${psCmd}`, `Git Bash:   ${posixCdCmd}`],
        };
    }
    return { displayDirWithSlash, cdTarget: posixCdTarget, cdCommands: [posixCdCmd] };
}
/** Clones (or copies) a starter template and resolves to the absolute directory it landed in. */
export async function cloneProjectTemplate(templateName, targetDir, runtimeNextSteps, options = {}) {
    const template = PROJECT_TEMPLATES[templateName];
    if (!template || !Object.hasOwn(PROJECT_TEMPLATES, templateName)) {
        exitUnknownTemplate(templateName);
    }
    const dirName = templateTargetDir(templateName, targetDir);
    if (!isTargetDirSafe(dirName)) {
        errorFactories.invalidPath(dirName).exit();
    }
    // If targetDir is an absolute path, use it directly as the destination
    // Otherwise resolve it relative to cwd()
    const destination = isAbsolute(dirName) ? dirName : resolve(cwd(), dirName);
    const { displayDirWithSlash, cdCommands } = formatProjectPaths(dirName);
    if (existsSync(destination) && readdirSync(destination).length > 0) {
        errorFactories.directoryExists(destination).exit();
    }
    if (!options.quiet) {
        showCommandHeader(`Cloning template: ${templateName}`);
        showDetail(`${template.description}\n`, 0);
        showDetail(`Source: ${template.bundledPath || template.generated || template.composed ? "bundled Flisk example" : template.repo}`, 0);
        if (template.ref)
            showDetail(`Commit: ${template.ref}`, 0);
        showDetail(`Destination: ${destination}\n`, 0);
    }
    let gitStep = "clone";
    let bundledCopyUsed = false;
    try {
        if (template.generated === "swarm") {
            writeSwarmProject(destination);
        }
        else if (template.generated === "security") {
            writeSecurityProject(destination);
        }
        else if (template.generated === "super-agent") {
            writeSuperAgentProject(destination);
        }
        else if (template.generated === "langgraph") {
            writeLanggraphProject(destination);
        }
        else if (template.generated === "tool-loop") {
            writeToolLoopProject(destination);
        }
        else if (template.composed === "next-postgres") {
            const lock = writeNextPostgresProject(destination);
            if (!lock.ok) {
                console.log(chalk.yellow(`⚠️  No package-lock.json for the web resource (${lock.reason}). The image build needs one: run \`${LOCKFILE_COMMAND}\` in ${join(destination, "services/app/web")}.`));
            }
        }
        else if (template.bundledPath) {
            const bundledSource = resolveBundledTemplateDir(template.bundledPath, {
                packageRoot: resolve(dirname(fileURLToPath(import.meta.url)), "../../../"),
                exeDir: dirname(execPath),
                workingDir: cwd(),
            });
            if (bundledSource) {
                bundledCopyUsed = true;
                cpSync(bundledSource, destination, { recursive: true });
            }
            else {
                // No bundled copy (standalone binary whose engine bundle predates #3880): clone the same example.
                for (const gitArgs of templateGitCommands(template, destination)) {
                    gitStep =
                        gitArgs[0] === "clone" ? "clone" : gitArgs[2] === "remote" ? "remote" : "checkout";
                    execFileSync("git", gitArgs, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" });
                }
            }
            const projectSlug = basename(destination).replace(/-/g, "_");
            for (const file of [
                "services/platform/messaging/docker-compose.yml",
                "services/shop/orders-api/service.json",
                "services/shop/orders-api/src/index.ts",
                "services/shop/orders-worker/service.json",
                "services/shop/orders-worker/src/index.ts",
            ]) {
                const copiedPath = join(destination, file);
                if (!existsSync(copiedPath))
                    continue;
                const contents = readFileSync(copiedPath, "utf-8");
                writeFileSync(copiedPath, contents.replaceAll("flisk_example", projectSlug));
            }
        }
        else {
            // Piped, not inherited: a raw git progress dump is noise for the caller and, in the
            // one-command flow, it interleaves with the frame that is already on screen.
            for (const gitArgs of templateGitCommands(template, destination)) {
                gitStep =
                    gitArgs[0] === "clone" ? "clone" : gitArgs[2] === "remote" ? "remote" : "checkout";
                execFileSync("git", gitArgs, {
                    stdio: ["ignore", "pipe", "pipe"],
                    encoding: "utf-8",
                });
            }
        }
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const message = template.bundledPath && bundledCopyUsed
            ? `Bundled example copy failed (${lastLine(detail)}). Reinstall the Flisk CLI package and try again.`
            : gitStep === "remote"
                ? `git remote rename origin upstream failed: ${lastLine(detail)}. The cloned repository is left in ${destination}; inspect its remotes before trying again.`
                : gitStep === "checkout"
                    ? `git checkout of the pinned commit ${template.ref} failed: ${lastLine(detail)}. ${destination} is left at the default branch; delete it before trying again.`
                    : `git clone failed: ${lastLine(detail)}. Check you have git installed and network access.`;
        // A caller that paints its own surface (the one-command flow) needs to report the
        // failure itself instead of having the process die mid-paint.
        if (options.quiet) {
            throw new FliskError(message, [
                template.bundledPath && bundledCopyUsed
                    ? "Reinstall the Flisk CLI package, then run the command again"
                    : "Check that git is installed and that you are online, then run the command again",
            ]);
        }
        showErrorAndExit(message);
    }
    // A copied or cloned starter ships service.json files but no .flisk/project.json, and every command that needs a
    // project root refuses without one: `flisk doctor`, `flisk status` and `flisk resources` in the new folder failed
    // with "Could not find project root". Generated local-process starters get it too (#4292).
    if (!existsSync(join(destination, ".flisk", PROJECT_JSON))) {
        writeDefaultProjectConfig(destination);
    }
    clearDiscoveryCache();
    if (options.quiet)
        return destination;
    const printCdStep = () => {
        const [first, ...rest] = cdCommands;
        showDetail(`1. ${first}`);
        for (const alt of rest)
            showDetail(`   ${alt}`);
    };
    if (template.generated) {
        // Every service of a generated starter declares `command`: it runs as local processes, with no Docker or Tilt.
        console.log(chalk.green(`\n✅ Created "${templateName}" in ${displayDirWithSlash}`));
        showDetail("\nNext steps:", 0);
        printCdStep();
        showDetail("2. flisk up       # start it as local processes (no Docker needed)");
        showDetail("3. cat README.md  # what to send it");
        return destination;
    }
    if (template.composed) {
        console.log(chalk.green(`\n✅ Created "${templateName}" in ${displayDirWithSlash}`));
        showDetail("\nNext steps:", 0);
        printCdStep();
        showDetail("2. flisk up       # Postgres, the migrator, the API and the website (needs Docker)");
        showDetail("3. cat README.md  # what each part does");
        return destination;
    }
    console.log(chalk.green(`\n✅ Cloned "${templateName}" into ${displayDirWithSlash}`));
    showDetail("\nNext steps:", 0);
    printCdStep();
    showDetail("2. flisk doctor   # check Docker/Tilt are ready");
    showDetail("3. flisk up       # start the stack");
    if (!template.bundledPath) {
        showDetail("\nThe starter is the git remote upstream; add your own with git remote add origin <url>.", 0);
    }
    showDetail("\nRuntime readiness:", 0);
    for (const line of runtimeNextSteps)
        showDetail(line, 0);
    return destination;
}
const DEFAULT_PROJECT_JSON = {
    version: "1.0",
    project: {
        name: "",
        version: "1.0.0",
    },
    phases: {
        pre_alpha: {
            name: "Pre-Alpha",
            description: "Core infrastructure and MVP services",
            enabledStacks: getDefaultCoreServices(),
        },
        alpha: {
            name: "Alpha",
            description: "Essential business services",
            enabledStacks: [],
        },
        beta: {
            name: "Beta",
            description: "Extended features",
            enabledStacks: [],
        },
        out_of_scope: {
            name: "Out of Scope",
            description: "Future releases",
            enabledStacks: [],
        },
    },
    optional_infra: {
        monitoring: false,
        elk: false,
        debezium: false,
        golden_image: true,
        verdaccio: false,
    },
    discovery: {
        // Generic PSR layout (services/<stack>/<resource>/service.json) - every Flisk example
        // repo (restaurant, saas-starter, user-management, ...) uses its own stack names here,
        // not the literal "product"/"platform" folders from the internal platform monorepo.
        paths: ["services/*/*"],
    },
    overrides: {},
};
/**
 * Writes .flisk/project.json with the defaults `flisk project --yes` uses, and nothing else: no generated Tiltfile, Compose file,
 * .env or engine copy. `flisk up` uses it to adopt a directory of `command` services as a project, so `flisk down` and
 * `flisk doctor` find it afterwards.
 */
export function writeDefaultProjectConfig(projectRoot) {
    const projectConfig = JSON.parse(JSON.stringify(DEFAULT_PROJECT_JSON));
    projectConfig.project.name = deriveProjectName(basename(projectRoot));
    ensureDirectory(join(projectRoot, ".flisk"));
    writeJsonFile(join(projectRoot, ".flisk", PROJECT_JSON), projectConfig);
}
/**
 * Prints the template catalog: with `json`, the usual envelope with the templates in `data.templates` (the same rows
 * as the `project_templates` MCP tool); otherwise one block per template for a person to read.
 */
export function printTemplateCatalog(json) {
    const templates = listProjectTemplates();
    if (json) {
        console.log(JSON.stringify(createMachineEnvelope({ templates })));
        return;
    }
    console.log(chalk.bold("Starter templates (flisk project <key>):\n"));
    for (const { key, repo, description, ref } of templates) {
        console.log(`  ${chalk.cyan(key)}  ${description}`);
        console.log(chalk.gray(`    ${repo}`));
        if (ref)
            console.log(chalk.gray(`    ref ${ref}`));
    }
}
export const projectCommand = addYesOption(new Command("project"))
    .alias("init")
    .description("Initialize or validate project-level master configuration")
    .argument("[template]", `Clone a starter example instead of a blank project (${Object.keys(PROJECT_TEMPLATES).join(", ")})`)
    .option("--path <dir>", "Directory to clone the template into (default: the starter name, or its repository name)")
    .option("--check", "Check if master configs exist and are in sync")
    .option("--force", "Overwrite existing configuration (dangerous)")
    .option("--config-file <path>", "Load project config from existing JSON file")
    .option("-q, --quiet", "Only print what fails; used by `flisk demo`", false)
    .option("--no-agent-skills", "Do not write the Flisk agent skills (.claude/skills, .agents/skills) and AGENTS.md")
    .option("--list", "List the starter templates (key, repo, description, pinned ref); with --json, the usual envelope with them in data.templates", false)
    .option("--json", "Print one JSON envelope on stdout; implies --yes and --quiet", false)
    .addHelpText("after", "\nExamples:\n  flisk project\n  flisk project demo\n  flisk project --check")
    .action(async (template, options) => {
    const json = Boolean(options.json);
    if (options.list) {
        printTemplateCatalog(json);
        return;
    }
    // --json never prompts and prints no progress: it takes the defaults --yes takes.
    const yes = Boolean(options.yes || json);
    const quiet = Boolean(options.quiet || json);
    const { assertMachineReadyOrExit, detectRuntimePrerequisites, formatRuntimeNextSteps } = await import("../utils/cold-preflight.js");
    const action = async () => {
        // Project setup only writes files: it must not need a running Docker daemon
        // or an installed Tilt. The runtime is checked on `flisk up`.
        await assertMachineReadyOrExit({ scope: "scaffold" });
        const runtime = detectRuntimePrerequisites();
        const runtimeNextSteps = formatRuntimeNextSteps(runtime);
        if (template) {
            if (json && !Object.hasOwn(PROJECT_TEMPLATES, template)) {
                const actionHint = actionWordHint(template);
                throw new FliskError(`Unknown template: "${template}"`, [
                    ...(actionHint ? [`Did you mean "${actionHint}"?`] : []),
                    `Use one of: ${Object.keys(PROJECT_TEMPLATES).join(", ")}`,
                    "Or run `flisk project` with no template for a blank project",
                ]);
            }
            const destination = await cloneProjectTemplate(template, options.path, runtimeNextSteps, {
                quiet,
            });
            return { data: { action: "cloned", template, path: destination, runtime } };
        }
        return initializeProject(runtime, runtimeNextSteps);
    };
    const initializeProject = async (runtime, runtimeNextSteps) => {
        let projectRoot = findProjectRoot();
        if (!projectRoot) {
            projectRoot = cwd();
            if (!quiet) {
                showStep("🚀 Initializing new Flisk project...\n");
                showDetail(`Location: ${projectRoot}\n`, 0);
            }
        }
        const fliskDir = join(projectRoot, ".flisk");
        const projectJsonPath = join(fliskDir, PROJECT_JSON);
        if (options.check) {
            const allFilesExist = MASTER_CONFIG_FILES.every((f) => existsSync(join(projectRoot, ".flisk", ".flisk-out", f)));
            const projectJsonExists = existsSync(projectJsonPath);
            if (json) {
                const valid = allFilesExist && projectJsonExists;
                return {
                    data: {
                        action: "check",
                        projectRoot,
                        valid,
                        hasProjectJson: projectJsonExists,
                        missingFiles: MASTER_CONFIG_FILES.filter((f) => !existsSync(join(projectRoot, ".flisk", ".flisk-out", f))),
                    },
                    errors: valid
                        ? []
                        : [
                            {
                                code: "PROJECT_INCOMPLETE",
                                message: "Project configuration incomplete",
                                suggestions: ["Run `flisk project --yes` to create the missing files"],
                            },
                        ],
                    exitCode: valid ? 0 : 1,
                };
            }
            if (allFilesExist && projectJsonExists) {
                const projectConfig = readProjectConfig(projectRoot);
                showSuccess("Project configuration is valid");
                showDetail(`Project: ${projectConfig.project.name}`, 3);
                showDetail(`Phases: ${Object.keys(projectConfig.phases).join(", ")}`, 3);
                process.exit(0);
            }
            else {
                console.log(chalk.yellow("⚠️  Project configuration incomplete:"));
                if (!projectJsonExists)
                    showDetail(".flisk/project.json (not found)", 3);
                if (!allFilesExist) {
                    for (const f of MASTER_CONFIG_FILES.filter((f) => !existsSync(join(projectRoot, ".flisk/.flisk-out", f)))) {
                        showDetail(`.flisk/.flisk-out/${f} (not found)`, 3);
                    }
                }
                showDetail("Run `flisk project` to create them.");
                process.exit(1);
            }
        }
        if (!quiet) {
            showCommandHeader("Project Configuration");
            showDetail(`Project root: ${projectRoot}\n`, 0);
        }
        if (!existsSync(fliskDir)) {
            ensureDirectory(fliskDir);
            if (!quiet)
                showSuccess("Created: .flisk/ directory");
        }
        const projectJsonExists = existsSync(projectJsonPath);
        if (projectJsonExists && !options.force) {
            if (!quiet)
                showSuccess(".flisk/project.json exists");
            const rawProjectConfig = JSON.parse(readFileSync(projectJsonPath, "utf-8"));
            const projectConfig = readProjectConfig(projectRoot);
            const discoveredStacks = discoverExistingServiceStacks(projectRoot);
            const autoEnabledStacks = syncDiscoveredStacksToPreAlpha(projectConfig, discoveredStacks);
            const shouldRewriteProjectConfig = autoEnabledStacks.length > 0 || !rawProjectConfig.phases;
            if (shouldRewriteProjectConfig) {
                writeJsonFile(projectJsonPath, projectConfig);
            }
            if (autoEnabledStacks.length > 0 && !quiet) {
                showDetail(`Auto-enabled discovered service stacks: ${autoEnabledStacks.join(", ")}`, 0);
            }
            if (!quiet)
                showStep("\n📋 Regenerating master configuration files...\n");
            await generateMasterConfigs(projectRoot, { quiet });
            const env = { created: ensureEnvFile(projectRoot), added: [] };
            if (env.created) {
                if (!quiet)
                    showSuccess("Created: .env (the defaults work as-is)");
            }
            else {
                env.added = completeEnvFile(projectRoot);
                if (env.added.length > 0 && !quiet) {
                    showSuccess(`Updated: .env (added ${env.added.join(", ")}; existing values unchanged)`);
                }
            }
            const ignored = ensureGitignore(projectRoot);
            if (ignored.length > 0 && !quiet) {
                showSuccess(`Added to .gitignore: ${ignored.join(", ")}`);
            }
            if (!quiet) {
                console.log(chalk.green("\n✅ Project configuration regenerated!"));
                showDetail("\nGenerated in .flisk/.flisk-out/:", 0);
                for (const file of MASTER_CONFIG_FILES) {
                    showDetail(`- ${file}`);
                }
                showDetail("\nRuntime readiness:", 0);
                for (const line of runtimeNextSteps)
                    showDetail(line, 0);
            }
            return {
                data: {
                    action: "regenerated",
                    projectRoot,
                    autoEnabledStacks,
                    generatedFiles: [...MASTER_CONFIG_FILES],
                    env,
                    gitignoreAdded: ignored,
                    runtime,
                },
            };
        }
        if (projectJsonExists && options.force && !yes) {
            console.log(chalk.red("\n⚠️  WARNING: --force will overwrite .flisk/project.json!"));
            const confirm = await promptConfirm({
                message: "This will reset your project configuration. Continue?",
                initial: false,
            });
            if (!confirm) {
                showCancelled();
                return { data: null };
            }
        }
        let projectConfig;
        const discoveredStacks = discoverExistingServiceStacks(projectRoot);
        if (options.configFile) {
            const configFilePath = resolve(options.configFile);
            if (!existsSync(configFilePath)) {
                throw new FliskError(`Config file not found: ${configFilePath}`, [
                    "Pass the path of an existing project.json to --config-file",
                    "Or drop --config-file to use the defaults",
                ]);
            }
            const configContent = readFileSync(configFilePath, "utf-8");
            projectConfig = JSON.parse(configContent);
            if (typeof projectConfig?.project?.name === "string") {
                const nameResult = validateProjectName(projectConfig.project.name.trim());
                if (!nameResult.valid) {
                    throw new FliskError(nameResult.error ?? "Invalid project name", [
                        "Set project.name in the config file to a Docker- and npm-compatible name (lowercase letters, numbers, and hyphens only)",
                    ]);
                }
                projectConfig.project.name = projectConfig.project.name.trim();
            }
            if (!quiet)
                showSuccess(`Loaded config from: ${configFilePath}`);
        }
        else if (yes) {
            projectConfig = JSON.parse(JSON.stringify(DEFAULT_PROJECT_JSON));
            projectConfig.project.name = deriveProjectName(basename(projectRoot));
            if (!quiet)
                console.log(chalk.gray("Using default configuration (non-interactive mode)"));
        }
        else {
            showStep("📝 Project Setup Wizard\n");
            const projectName = await promptText({
                message: "Project name:",
                initial: deriveProjectName(basename(projectRoot)),
                validate: (input) => {
                    const result = validateProjectName(input.trim());
                    return result.valid ? true : (result.error ?? "Project name is required");
                },
            });
            const projectVersion = await promptText({
                message: "Project version:",
                initial: "1.0.0-alpha",
            });
            const corePreAlphaFeatures = Object.values(PROJECT_FEATURES).filter((f) => f.category === "core" && f.phase === "pre_alpha");
            const corePreAlphaNames = new Set(corePreAlphaFeatures.map((f) => f.name));
            const preAlphaStacks = await promptMultiSelect({
                message: "Select Pre-Alpha enabled stacks (core infrastructure):",
                choices: [
                    ...corePreAlphaFeatures.map((f) => ({
                        title: f.description,
                        value: f.name,
                        selected: f.enabled_by_default,
                    })),
                    // Exclude discovered stacks that duplicate a core feature name (e.g. a
                    // "database-management" service dir) - otherwise the same value shows
                    // up as two checked boxes and accepting defaults writes it twice into
                    // project.json, which the generator later emits as a duplicate
                    // Starlark dict key and Tilt refuses to parse.
                    ...discoveredStacks
                        .filter((stack) => !corePreAlphaNames.has(stack))
                        .map((stack) => ({
                        title: `${stack} (discovered service stack)`,
                        value: stack,
                        selected: true,
                    })),
                ],
            });
            const alphaStacks = await promptMultiSelect({
                message: "Select Alpha enabled stacks (core business):",
                choices: [
                    { title: "api (Backend API)", value: "api" },
                    { title: "app (Frontend app)", value: "app" },
                ],
            });
            const betaStacks = await promptMultiSelect({
                message: "Select Beta enabled stacks (extended features):",
                choices: [
                    { title: "worker (Background jobs)", value: "worker" },
                    { title: "migrator (Database migrations)", value: "migrator" },
                ],
            });
            const optionalInfra = await promptMultiSelect({
                message: "Enable optional infrastructure (high resource):",
                choices: Object.values(PROJECT_FEATURES)
                    .filter((f) => f.category === "optional")
                    .concat(Object.values(PROJECT_FEATURES).filter((f) => f.category === "premium"))
                    .map((f) => ({
                    title: f.description,
                    value: f.name,
                    selected: f.enabled_by_default,
                })),
            });
            showStep("\n📂 Service discovery");
            showDetail("What: folder patterns Flisk scans for a service.json in each match.");
            showDetail("Where: type one or more globs, comma-separated.");
            showDetail("How: saved as discovery.paths in .flisk/project.json - editable later.");
            showDetail(`Example: ${DEFAULT_PROJECT_JSON.discovery.paths.join(", ")}\n`);
            const discoveryPaths = await promptText({
                message: "Folders to scan:",
                initial: DEFAULT_PROJECT_JSON.discovery.paths.join(", "),
            });
            projectConfig = JSON.parse(JSON.stringify(DEFAULT_PROJECT_JSON));
            projectConfig.project.name = projectName;
            projectConfig.project.version = projectVersion;
            projectConfig.phases.pre_alpha.enabledStacks = Array.from(new Set(preAlphaStacks));
            projectConfig.phases.alpha.enabledStacks = Array.from(new Set(alphaStacks));
            projectConfig.phases.beta.enabledStacks = Array.from(new Set(betaStacks));
            projectConfig.optional_infra.monitoring = optionalInfra.includes("monitoring");
            projectConfig.optional_infra.elk = optionalInfra.includes("elk");
            projectConfig.optional_infra.debezium = optionalInfra.includes("debezium");
            projectConfig.optional_infra.golden_image = optionalInfra.includes("golden_image");
            projectConfig.optional_infra.verdaccio = optionalInfra.includes("verdaccio");
            const parsedDiscoveryPaths = discoveryPaths
                .split(",")
                .map((p) => p.trim())
                .filter((p) => p.length > 0);
            projectConfig.discovery.paths =
                parsedDiscoveryPaths.length > 0
                    ? parsedDiscoveryPaths
                    : DEFAULT_PROJECT_JSON.discovery.paths;
        }
        const autoEnabledStacks = syncDiscoveredStacksToPreAlpha(projectConfig, discoveredStacks);
        if (autoEnabledStacks.length > 0 && !quiet) {
            showDetail(`Auto-enabled discovered service stacks: ${autoEnabledStacks.join(", ")}`, 0);
        }
        if (!quiet)
            showStep("\n📋 Creating project configuration...\n");
        writeJsonFile(projectJsonPath, projectConfig);
        if (!quiet) {
            showSuccess("Created: .flisk/project.json");
            showDetail(`→ Project: ${projectConfig.project.name}`);
            showStep("\n📋 Generating master configuration files...\n");
        }
        await generateMasterConfigs(projectRoot, { quiet });
        if (!quiet)
            showStep("\n🔧 Setting up environment variables...\n");
        const env = { created: ensureEnvFile(projectRoot), added: [] };
        if (env.created) {
            if (!quiet)
                showSuccess("Created: .env (the defaults work as-is)");
        }
        else {
            // An .env from an older CLI lacks keys a newer one expects; add them without changing anything already there.
            env.added = completeEnvFile(projectRoot);
            if (env.added.length > 0) {
                if (!quiet) {
                    showSuccess(`Updated: .env (added ${env.added.join(", ")}; existing values unchanged)`);
                }
            }
            else if (!quiet) {
                showSuccess("Found: .env (environment already configured)");
            }
        }
        const envValidation = validateEnvFile(projectRoot);
        if (envValidation.missing.length > 0) {
            console.log(chalk.yellow("\n⚠️  Missing required environment variables:"));
            for (const missing of envValidation.missing) {
                showDetail(`- ${missing}`, 1);
            }
            showDetail("→ Edit .env and fill in these values before running `flisk up`", 1);
        }
        const ignored = ensureGitignore(projectRoot);
        if (ignored.length > 0 && !quiet) {
            showSuccess(`Added to .gitignore: ${ignored.join(", ")}`);
        }
        // A coding agent opened in the project then knows to build and run the app with Flisk.
        // The project works without them, so a failure here is a warning, not an exit.
        let skillFiles = [];
        if (options.agentSkills !== false) {
            try {
                skillFiles = installAgentSkills(projectRoot);
                if (skillFiles.length > 0 && !quiet) {
                    showSuccess("Added agent skills: .claude/skills, .agents/skills and AGENTS.md (start with flisk-build)");
                }
            }
            catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                console.log(chalk.yellow(`⚠️  Could not add the agent skills: ${reason}`));
            }
        }
        if (!quiet) {
            console.log(chalk.green("\n✅ Project configuration complete!"));
            showDetail("\nGenerated files in .flisk/.flisk-out/:", 0);
            for (const file of MASTER_CONFIG_FILES) {
                showDetail(`- ${file}`);
            }
            showDetail("\nEnvironment configuration:", 0);
            showDetail("- .env (contains all required variables)");
            showDetail("\nSource file:", 0);
            showDetail("- .flisk/project.json (edit this to change project structure)");
            showDetail("\nNext steps:", 0);
            showDetail("1. flisk resource api --type backend --stack app   # scaffold a service");
            showDetail("2. flisk up app                                     # start it");
            showDetail("\nRuntime readiness:", 0);
            for (const line of runtimeNextSteps)
                showDetail(line, 0);
            showDetail("\nAfter editing .flisk/project.json, run `flisk config regenerate`.", 0);
        }
        return {
            data: {
                action: "created",
                projectRoot,
                projectName: projectConfig.project.name,
                autoEnabledStacks,
                generatedFiles: [...MASTER_CONFIG_FILES],
                env,
                missingEnv: envValidation.missing,
                gitignoreAdded: ignored,
                agentSkills: skillFiles,
                runtime,
            },
        };
    };
    if (json) {
        await runJsonCommand("PROJECT_FAILED", "flisk project", action);
        return;
    }
    await runCommand(action);
});
