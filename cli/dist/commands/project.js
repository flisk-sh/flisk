// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { cwd } from "node:process";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { Command } from "commander";
import { generateMasterConfigs, readProjectConfig } from "../generator/template-engine.js";
import { MASTER_CONFIG_FILES, PROJECT_JSON } from "../utils/constants.js";
import { completeEnvFile, ensureEnvFile, validateEnvFile } from "../utils/env-validator.js";
import { errorFactories, runCommand, showErrorAndExit } from "../utils/errors.js";
import { ensureDirectory, ensureGitignore, writeJsonFile } from "../utils/file-helpers.js";
import { showCancelled, showCommandHeader, showDetail, showStep, showSuccess, } from "../utils/formatting.js";
import { findProjectRoot } from "../utils/paths.js";
import { PROJECT_FEATURES } from "../utils/project-features.js";
import { PROJECT_TEMPLATES } from "../utils/project-templates.js";
import { promptConfirm, promptMultiSelect, promptText } from "../utils/prompt.js";
import { discoverStackNames } from "../utils/services.js";
import { isPathSafe } from "../utils/validation.js";
/**
 * Stack names discovered from service.json files already in the repo (e.g. a
 * cloned starter template). Tilt's discovery groups app resources by this
 * same `stack` field, so a stack must appear here to ever be enabled by
 * `should_enable()` - without it, `tdk up` would launch infra only and no
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
 * pre_alpha, so a resource scaffolded after `tdk project` is picked up by
 * `tdk up` without re-running `tdk project`. Returns the stacks it enabled.
 */
export function enableDiscoveredStacks(projectRoot, resources) {
    const projectJsonPath = join(projectRoot, ".tdk", PROJECT_JSON);
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
async function cloneProjectTemplate(templateName, targetDir) {
    const template = PROJECT_TEMPLATES[templateName];
    if (!template) {
        console.log(chalk.red(`\n❌ Unknown template: "${templateName}"`));
        console.log(chalk.yellow("\nAvailable templates:"));
        for (const [name, info] of Object.entries(PROJECT_TEMPLATES)) {
            console.log(`  ${chalk.cyan(name)} ${chalk.gray(`- ${info.description}`)}`);
        }
        console.log(chalk.gray("\nOr run `tdk project` with no template for a blank project."));
        process.exit(1);
    }
    const dirName = targetDir || (template.repo.split("/").pop() ?? templateName).replace(/\.git$/, "");
    if (!isPathSafe(dirName)) {
        errorFactories.invalidPath(dirName).exit();
    }
    const destination = resolve(cwd(), dirName);
    if (existsSync(destination) && readdirSync(destination).length > 0) {
        errorFactories.directoryExists(destination).exit();
    }
    showCommandHeader(`Cloning template: ${templateName}`);
    showDetail(`${template.description}\n`, 0);
    showDetail(`Source: ${template.bundledPath ? "bundled TDK example" : template.repo}`, 0);
    showDetail(`Destination: ${destination}\n`, 0);
    try {
        if (template.bundledPath) {
            const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");
            cpSync(resolve(packageRoot, template.bundledPath), destination, { recursive: true });
            const projectSlug = basename(destination).replace(/-/g, "_");
            for (const file of [
                "services/platform/messaging/docker-compose.yml",
                "services/shop/orders-api/service.json",
                "services/shop/orders-api/src/index.ts",
                "services/shop/orders-worker/service.json",
                "services/shop/orders-worker/src/index.ts",
            ]) {
                const copiedPath = join(destination, file);
                const contents = readFileSync(copiedPath, "utf-8");
                writeFileSync(copiedPath, contents.replaceAll("tdk_example", projectSlug));
            }
        }
        else {
            execFileSync("git", ["clone", template.repo, destination], { stdio: "inherit" });
        }
    }
    catch {
        showErrorAndExit(template.bundledPath
            ? "Bundled example copy failed. Reinstall the TDK CLI package and try again."
            : "git clone failed. Check you have git installed and network access.");
    }
    console.log(chalk.green(`\n✅ Cloned "${templateName}" into ${dirName}/`));
    showDetail("\nNext steps:", 0);
    showDetail(`1. cd ${dirName}`);
    showDetail("2. tdk doctor   # check Docker/Tilt are ready");
    showDetail("3. tdk up       # start the stack");
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
        // Generic PSR layout (services/<stack>/<resource>/service.json) - every TDK example
        // repo (restaurant, saas-starter, user-management, ...) uses its own stack names here,
        // not the literal "product"/"platform" folders from the internal platform monorepo.
        paths: ["services/*/*"],
    },
    overrides: {},
};
export const projectCommand = new Command("project")
    .description("Initialize or validate project-level master configuration")
    .argument("[template]", `Clone a starter example instead of a blank project (${Object.keys(PROJECT_TEMPLATES).join(", ")})`)
    .option("--path <dir>", "Directory to clone the template into (default: the template's repo name)")
    .option("--check", "Check if master configs exist and are in sync")
    .option("--force", "Overwrite existing configuration (dangerous)")
    .option("--yes", "Non-interactive mode (use defaults)")
    .option("--config-file <path>", "Load project config from existing JSON file")
    .action(async (template, options) => {
    const { assertMachineReadyOrExit } = await import("../utils/cold-preflight.js");
    await assertMachineReadyOrExit();
    if (template) {
        await runCommand(async () => cloneProjectTemplate(template, options.path));
        return;
    }
    await runCommand(async () => {
        let projectRoot = findProjectRoot();
        if (!projectRoot) {
            projectRoot = cwd();
            showStep("🚀 Initializing new TDK project...\n");
            showDetail(`Location: ${projectRoot}\n`, 0);
        }
        const tdkDir = join(projectRoot, ".tdk");
        const projectJsonPath = join(tdkDir, PROJECT_JSON);
        if (options.check) {
            const allFilesExist = MASTER_CONFIG_FILES.every((f) => existsSync(join(projectRoot, ".tdk", ".tdk-out", f)));
            const projectJsonExists = existsSync(projectJsonPath);
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
                    showDetail(".tdk/project.json (not found)", 3);
                if (!allFilesExist) {
                    for (const f of MASTER_CONFIG_FILES.filter((f) => !existsSync(join(projectRoot, ".tdk/.tdk-out", f)))) {
                        showDetail(`.tdk/.tdk-out/${f} (not found)`, 3);
                    }
                }
                showDetail("Run `tdk project` to create them.");
                process.exit(1);
            }
        }
        showCommandHeader("Project Configuration");
        showDetail(`Project root: ${projectRoot}\n`, 0);
        if (!existsSync(tdkDir)) {
            ensureDirectory(tdkDir);
            showSuccess("Created: .tdk/ directory");
        }
        const projectJsonExists = existsSync(projectJsonPath);
        if (projectJsonExists && !options.force) {
            showSuccess(".tdk/project.json exists");
            const rawProjectConfig = JSON.parse(readFileSync(projectJsonPath, "utf-8"));
            const projectConfig = readProjectConfig(projectRoot);
            const discoveredStacks = discoverExistingServiceStacks(projectRoot);
            const autoEnabledStacks = syncDiscoveredStacksToPreAlpha(projectConfig, discoveredStacks);
            const shouldRewriteProjectConfig = autoEnabledStacks.length > 0 || !rawProjectConfig.phases;
            if (shouldRewriteProjectConfig) {
                writeJsonFile(projectJsonPath, projectConfig);
            }
            if (autoEnabledStacks.length > 0) {
                showDetail(`Auto-enabled discovered service stacks: ${autoEnabledStacks.join(", ")}`, 0);
            }
            showStep("\n📋 Regenerating master configuration files...\n");
            await generateMasterConfigs(projectRoot);
            if (ensureEnvFile(projectRoot)) {
                showSuccess("Created: .env (the defaults work as-is)");
            }
            else {
                const added = completeEnvFile(projectRoot);
                if (added.length > 0) {
                    showSuccess(`Updated: .env (added ${added.join(", ")}; existing values unchanged)`);
                }
            }
            const ignored = ensureGitignore(projectRoot);
            if (ignored.length > 0) {
                showSuccess(`Added to .gitignore: ${ignored.join(", ")}`);
            }
            console.log(chalk.green("\n✅ Project configuration regenerated!"));
            showDetail("\nGenerated in .tdk/.tdk-out/:", 0);
            for (const file of MASTER_CONFIG_FILES) {
                showDetail(`- ${file}`);
            }
            return;
        }
        if (projectJsonExists && options.force) {
            console.log(chalk.red("\n⚠️  WARNING: --force will overwrite .tdk/project.json!"));
            const confirm = await promptConfirm({
                message: "This will reset your project configuration. Continue?",
                initial: false,
            });
            if (!confirm) {
                showCancelled();
                return;
            }
        }
        let projectConfig;
        const discoveredStacks = discoverExistingServiceStacks(projectRoot);
        if (options.configFile) {
            const configFilePath = resolve(options.configFile);
            if (!existsSync(configFilePath)) {
                showErrorAndExit(`Config file not found: ${configFilePath}`);
            }
            const configContent = readFileSync(configFilePath, "utf-8");
            projectConfig = JSON.parse(configContent);
            showSuccess(`Loaded config from: ${configFilePath}`);
        }
        else if (options.yes) {
            projectConfig = JSON.parse(JSON.stringify(DEFAULT_PROJECT_JSON));
            projectConfig.project.name = projectRoot.split("/").pop() || "my-project";
            console.log(chalk.gray("Using default configuration (non-interactive mode)"));
        }
        else {
            showStep("📝 Project Setup Wizard\n");
            const projectName = await promptText({
                message: "Project name:",
                initial: projectRoot.split("/").pop() || "my-project",
                validate: (input) => input.trim() !== "" || "Project name is required",
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
            showDetail("What: folder patterns TDK scans for a service.json in each match.");
            showDetail("Where: type one or more globs, comma-separated.");
            showDetail("How: saved as discovery.paths in .tdk/project.json - editable later.");
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
        if (autoEnabledStacks.length > 0) {
            showDetail(`Auto-enabled discovered service stacks: ${autoEnabledStacks.join(", ")}`, 0);
        }
        showStep("\n📋 Creating project configuration...\n");
        writeJsonFile(projectJsonPath, projectConfig);
        showSuccess("Created: .tdk/project.json");
        showDetail(`→ Project: ${projectConfig.project.name}`);
        showStep("\n📋 Generating master configuration files...\n");
        await generateMasterConfigs(projectRoot);
        showStep("\n🔧 Setting up environment variables...\n");
        const envCreated = ensureEnvFile(projectRoot);
        if (envCreated) {
            showSuccess("Created: .env (the defaults work as-is)");
        }
        else {
            // An .env from an older CLI lacks keys a newer one expects; add them without changing anything already there.
            const added = completeEnvFile(projectRoot);
            if (added.length > 0) {
                showSuccess(`Updated: .env (added ${added.join(", ")}; existing values unchanged)`);
            }
            else {
                showSuccess("Found: .env (environment already configured)");
            }
        }
        const envValidation = validateEnvFile(projectRoot);
        if (envValidation.missing.length > 0) {
            console.log(chalk.yellow("\n⚠️  Missing required environment variables:"));
            for (const missing of envValidation.missing) {
                showDetail(`- ${missing}`, 1);
            }
            showDetail("→ Edit .env and fill in these values before running `tdk up`", 1);
        }
        const ignored = ensureGitignore(projectRoot);
        if (ignored.length > 0) {
            showSuccess(`Added to .gitignore: ${ignored.join(", ")}`);
        }
        console.log(chalk.green("\n✅ Project configuration complete!"));
        showDetail("\nGenerated files in .tdk/.tdk-out/:", 0);
        for (const file of MASTER_CONFIG_FILES) {
            showDetail(`- ${file}`);
        }
        showDetail("\nEnvironment configuration:", 0);
        showDetail("- .env (contains all required variables)");
        showDetail("\nSource file:", 0);
        showDetail("- .tdk/project.json (edit this to change project structure)");
        showDetail("\nNext steps:", 0);
        showDetail("1. tdk resource api --type backend --stack app   # scaffold a service");
        showDetail("2. tdk up app                                     # start it");
        showDetail("\nAfter editing .tdk/project.json, run `tdk config regenerate`.", 0);
    });
});
