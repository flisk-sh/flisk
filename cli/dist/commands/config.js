// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { hasVerdaccioLicense } from "../generator/extension-fetch.js";
import { generateMasterConfigs, readProjectConfig, TemplateEngine, verifyMasterConfigs, } from "../generator/template-engine.js";
import { isMasterConfigFileName } from "../types/index.js";
import { assertValid, handleDryRun } from "../utils/command-helpers.js";
import { explainConfigFile } from "../utils/config-explain.js";
import { MASTER_CONFIG_FILES, PROJECT_JSON, RESOURCE_DEFAULTS_FILE, TECH_STACK_FILE, } from "../utils/constants.js";
import { clearDiscoveryCache } from "../utils/discovery-context.js";
import { checkPrismaConsistency } from "../utils/doctor-wiring.js";
import { errorFactories, FliskError, requireProjectRoot, runCommand, showError, } from "../utils/errors.js";
import { writeJsonFile } from "../utils/file-helpers.js";
import { runJsonCommand } from "../utils/json-command.js";
import { createMachineEnvelope, writeMachineError } from "../utils/machine-output.js";
import { findProjectRoot } from "../utils/paths.js";
import { SERVICE_MANIFEST_SCHEMA_VERSION, validateServiceManifest, } from "../utils/service-manifest.js";
import { discoverResourcesWithProblems, discoverServiceManifestPaths, warnAboutSkippedFiles, } from "../utils/services.js";
import { evaluateSharedPlatformPostgres } from "../utils/shared-platform-postgres.js";
import { validateOptionalInfraService } from "../utils/validation.js";
/** The change `flisk config regenerate` makes to each master file, from the same generator its dry run compares with. */
export function regeneratePlan(projectRoot) {
    const newFiles = new TemplateEngine().generateAll(readProjectConfig(projectRoot));
    const outputDir = join(projectRoot, ".flisk", ".flisk-out");
    return MASTER_CONFIG_FILES.map((file) => {
        const filePath = join(outputDir, file);
        if (!existsSync(filePath))
            return { file, status: "new", lineDiff: 0 };
        const current = readFileSync(filePath, "utf-8");
        const next = newFiles[file];
        if (current === next)
            return { file, status: "unchanged", lineDiff: 0 };
        return {
            file,
            status: "modified",
            lineDiff: next.split("\n").length - current.split("\n").length,
        };
    });
}
/** Human wording for `flisk config explain`, one line per drift outcome. */
const DRIFT_LABELS = {
    "blocks-up": "yes, until the edit is removed or --ignore-drift is passed",
    none: "no",
    unknown: "unknown",
};
export const configCommand = new Command("config")
    .description("Manage project configuration and regenerate master files")
    .addCommand(new Command("regenerate")
    .description("Regenerate all 4 master config files from .flisk/project.json")
    .option("--dry-run", "Show what would change without writing files")
    .option("--json", "Print one JSON envelope on stdout with each master file's change (new, modified, unchanged)", false)
    .action(async (options) => {
    if (options.json) {
        await runJsonCommand("REGENERATE_FAILED", "flisk config regenerate", async () => {
            const projectRoot = findProjectRoot();
            if (!projectRoot)
                throw errorFactories.notInProject();
            const changes = regeneratePlan(projectRoot);
            if (!options.dryRun) {
                await generateMasterConfigs(projectRoot, { discardHandEdits: true, quiet: true });
            }
            return {
                data: {
                    dryRun: Boolean(options.dryRun),
                    hasChanges: changes.some((change) => change.status !== "unchanged"),
                    changes,
                },
            };
        });
        return;
    }
    await runCommand(async () => {
        const projectRoot = requireProjectRoot();
        // The plan is the comparison report, so it supplies its own printer rather than the standard pair.
        if (handleDryRun(options, "", "", () => {
            console.log(chalk.blue("🔍 Dry run - comparing current files with new configuration...\n"));
            const projectConfig = readProjectConfig(projectRoot);
            const engine = new TemplateEngine();
            const newFiles = engine.generateAll(projectConfig);
            const outputDir = join(projectRoot, ".flisk", ".flisk-out");
            const filesToCheck = MASTER_CONFIG_FILES;
            const fileGroups = [
                {
                    title: "📋 Core orchestration",
                    files: [TECH_STACK_FILE, RESOURCE_DEFAULTS_FILE],
                    description: "Tilt tech stack and resource defaults; drives all service generation",
                },
                {
                    title: "📦 Project spec",
                    files: ["spec.master"],
                    description: "Compiled project specification; used by Tilt for service discovery",
                },
            ];
            let hasChanges = false;
            for (const group of fileGroups) {
                let groupHasChanges = false;
                const groupChanges = [];
                for (const filename of group.files) {
                    if (!filesToCheck.includes(filename))
                        continue;
                    if (!isMasterConfigFileName(filename))
                        continue;
                    const newContent = newFiles[filename];
                    const filePath = join(outputDir, filename);
                    if (!existsSync(filePath)) {
                        groupHasChanges = true;
                        groupChanges.push({ filename, isNew: true, lineDiff: 0, diffLines: [] });
                        continue;
                    }
                    const currentContent = readFileSync(filePath, "utf-8");
                    if (currentContent !== newContent) {
                        groupHasChanges = true;
                        const currentLines = currentContent.split("\n").length;
                        const newLines = newContent.split("\n").length;
                        const lineDiff = newLines - currentLines;
                        const currentLinesArr = currentContent.split("\n");
                        const newLinesArr = newContent.split("\n");
                        let firstDiffLine = -1;
                        for (let i = 0; i < Math.max(currentLinesArr.length, newLinesArr.length); i++) {
                            if (currentLinesArr[i] !== newLinesArr[i]) {
                                firstDiffLine = i;
                                break;
                            }
                        }
                        const diffLines = [];
                        if (firstDiffLine >= 0) {
                            const contextStart = Math.max(0, firstDiffLine - 1);
                            const contextEnd = Math.min(currentLinesArr.length, firstDiffLine + 2);
                            for (let i = contextStart; i < contextEnd; i++) {
                                const line = currentLinesArr[i];
                                const newLine = newLinesArr[i];
                                if (line !== newLine) {
                                    if (line !== undefined) {
                                        diffLines.push(chalk.red(`     - ${line.substring(0, 60)}${line.length > 60 ? "..." : ""}`));
                                    }
                                    if (newLine !== undefined) {
                                        diffLines.push(chalk.green(`     + ${newLine.substring(0, 60)}${newLine.length > 60 ? "..." : ""}`));
                                    }
                                }
                                else {
                                    diffLines.push(chalk.gray(`       ${line.substring(0, 60)}${line.length > 60 ? "..." : ""}`));
                                }
                            }
                        }
                        groupChanges.push({ filename, isNew: false, lineDiff, diffLines });
                    }
                }
                if (groupHasChanges) {
                    console.log(chalk.blue(`\n${group.title}`));
                    console.log(chalk.gray(`   ${group.description}\n`));
                    for (const change of groupChanges) {
                        if (change.isNew) {
                            console.log(chalk.yellow(`  📁 ${change.filename}`));
                            console.log(chalk.gray("     Status: NEW (file does not exist)\n"));
                        }
                        else {
                            console.log(chalk.yellow(`  📝 ${change.filename}`));
                            console.log(chalk.gray("     Status: MODIFIED"));
                            if (change.lineDiff > 0) {
                                console.log(chalk.gray(`     Lines: +${change.lineDiff}`));
                            }
                            else if (change.lineDiff < 0) {
                                console.log(chalk.gray(`     Lines: ${change.lineDiff}`));
                            }
                            else {
                                console.log(chalk.gray("     Lines: content changed"));
                            }
                            for (const diffLine of change.diffLines) {
                                console.log(diffLine);
                            }
                            console.log("");
                        }
                    }
                    hasChanges = true;
                }
                else {
                    console.log(chalk.green(`\n✅ ${group.title} — all up to date`));
                    console.log(chalk.gray(`   ${group.description}\n`));
                }
            }
            if (hasChanges) {
                console.log(chalk.blue("💡 Run without --dry-run to apply these changes.\n"));
            }
            else {
                console.log(chalk.green("✅ All files are already up to date!\n"));
            }
        })) {
            return;
        }
        console.log(chalk.blue("📋 Regenerating master configuration files...\n"));
        await generateMasterConfigs(projectRoot, { discardHandEdits: true });
        console.log(chalk.green("\n✅ Configuration regenerated!"));
    });
}))
    .addCommand(new Command("migrate")
    .description("Migrate service.json files to the current schema version")
    .option("--json", "Print one JSON envelope on stdout with the migrated files", false)
    .action(async (options) => {
    const action = async () => {
        const projectRoot = options.json ? findProjectRoot() : requireProjectRoot();
        if (!projectRoot)
            throw errorFactories.notInProject();
        const warnings = [];
        const failures = [];
        const pendingMigrations = [];
        for (const filePath of discoverServiceManifestPaths(projectRoot)) {
            let manifest;
            try {
                manifest = JSON.parse(readFileSync(filePath, "utf-8"));
            }
            catch (error) {
                failures.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
                continue;
            }
            if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
                failures.push(`${filePath}: expected a JSON object`);
                continue;
            }
            const record = manifest;
            if (record.appType === undefined && typeof record.type === "string") {
                record.appType = record.type;
            }
            if (record.schemaVersion === SERVICE_MANIFEST_SCHEMA_VERSION)
                continue;
            if (record.schemaVersion !== undefined) {
                failures.push(`${filePath}.schemaVersion: cannot migrate unsupported version ${String(record.schemaVersion)} automatically`);
                continue;
            }
            const validation = validateServiceManifest({ ...record, schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION }, filePath);
            if (validation.errors.length > 0) {
                failures.push(...validation.errors);
                continue;
            }
            for (const warning of validation.warnings) {
                warnings.push(warning);
                console.warn(chalk.yellow(`⚠️  ${warning}`));
            }
            record.schemaVersion = SERVICE_MANIFEST_SCHEMA_VERSION;
            pendingMigrations.push({ filePath, manifest: record });
        }
        // Nothing is written when one file fails, so a failed run leaves every service.json as it was.
        if (options.json && failures.length > 0) {
            return {
                data: null,
                errors: failures.map((message) => ({
                    code: "MIGRATE_FAILED",
                    message,
                    suggestions: ["Fix the file, then run `flisk config migrate` again"],
                })),
                exitCode: 1,
            };
        }
        for (const failure of failures)
            showError(failure);
        if (failures.length > 0)
            process.exit(1);
        for (const migration of pendingMigrations) {
            writeFileSync(migration.filePath, `${JSON.stringify(migration.manifest, null, 2)}\n`);
        }
        if (pendingMigrations.length > 0) {
            clearDiscoveryCache();
        }
        const migrated = pendingMigrations.length;
        console.log(chalk.green(`✅ Migrated ${migrated} service.json file${migrated === 1 ? "" : "s"} to schema version ${SERVICE_MANIFEST_SCHEMA_VERSION}.`));
        console.log(chalk.yellow("Review the diff; unknown fields were preserved."));
        return {
            data: {
                schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION,
                migrated: pendingMigrations.map(({ filePath }) => relative(projectRoot, filePath).split(sep).join("/")),
                warnings,
            },
        };
    };
    if (options.json) {
        await runJsonCommand("MIGRATE_FAILED", "flisk config migrate", action);
        return;
    }
    await runCommand(action);
}))
    .addCommand(new Command("verify")
    .description("Verify that generated files match .flisk/project.json")
    .option("--json", "Emit a machine-readable verification report")
    .action(async (options) => {
    const action = async () => {
        const projectRoot = options.json ? findProjectRoot() : requireProjectRoot();
        if (!projectRoot)
            throw errorFactories.notInProject();
        const { resources, problems } = discoverResourcesWithProblems(projectRoot);
        warnAboutSkippedFiles(problems);
        const manifestPaths = [
            ...resources.map((r) => r.configPath),
            ...problems.map((p) => p.path),
        ];
        const result = verifyMasterConfigs(projectRoot, { manifestPaths });
        // Same predicate as flisk doctor's Shared platform Postgres check.
        const sharedPostgres = evaluateSharedPlatformPostgres(projectRoot, resources);
        const prismaConsistency = checkPrismaConsistency(projectRoot, resources);
        const sharedPostgresErrors = sharedPostgres.unknownDependsOnNames.map(({ resource, name }) => `dependsOn "${name}" on ${resource} is not a known service or stack (shared platform Postgres names are postgres and database-management)`);
        if (options.json) {
            console.log(JSON.stringify(createMachineEnvelope({
                valid: result.valid && sharedPostgresErrors.length === 0 && prismaConsistency.didPass,
                errors: [
                    ...result.errors,
                    ...sharedPostgresErrors,
                    ...(prismaConsistency.didPass ? [] : [prismaConsistency.message]),
                ],
                warnings: result.warnings,
                diffs: result.diffs,
                sharedPlatformPostgres: sharedPostgres,
            })));
            if (!result.valid || sharedPostgresErrors.length > 0 || !prismaConsistency.didPass)
                process.exit(1);
            return;
        }
        console.log(chalk.blue("🔍 Verifying configuration...\n"));
        for (const warning of result.warnings) {
            console.warn(chalk.yellow(`⚠️  ${warning}`));
        }
        for (const error of sharedPostgresErrors) {
            showError(error);
        }
        if (!prismaConsistency.didPass)
            showError(prismaConsistency.message);
        if (sharedPostgres.willStart) {
            // Project resource set (discoverResourcesFromRoot), not a flisk up --only filter.
            // Feature-on alone is not new behavior — print gray so default projects are not noisy.
            // dependsOn is the reason Postgres starts when the feature is off — green.
            if (sharedPostgres.reason === "feature" && sharedPostgres.dependsOnUsers.length === 0) {
                const source = sharedPostgres.featureOnFromTiltfile || sharedPostgres.featureOnFromSpecMaster
                    ? " (generated Tiltfile/spec.master)"
                    : "";
                console.log(chalk.gray(`ℹ️  Postgres will start because database-management is enabled${source} (project-wide; not a flisk up selection)`));
            }
            else if (sharedPostgres.reason === "feature") {
                console.log(chalk.yellow(`ℹ️  Postgres will start because database-management is enabled and resource(s) ${sharedPostgres.dependsOnUsers.join(", ")} depend on postgres/database-management (project resource set; flisk up may select a subset)`));
            }
            else {
                console.log(chalk.green(`ℹ️  Postgres will start because resource(s) ${sharedPostgres.dependsOnUsers.join(", ")} depend on postgres/database-management (project resource set; flisk up may select a subset)`));
            }
        }
        else if (sharedPostgres.focusWouldEnableDatabaseManagement) {
            console.log(chalk.yellow("ℹ️  Postgres will not start from project.json/generated Tiltfile, but default focus/CORE_INFRA expansion would enable database-management on a typical flisk up"));
        }
        if (result.valid && sharedPostgresErrors.length === 0 && prismaConsistency.didPass) {
            console.log(chalk.green("✅ All files are in sync!"));
            return;
        }
        else {
            console.log(chalk.yellow("⚠️  Configuration issues found:"));
            for (const error of result.errors) {
                console.log(chalk.gray(`   - ${error}`));
            }
            for (const { diff } of result.diffs)
                console.log(chalk.gray(`\n${diff}`));
            const schemaErrors = result.errors.filter((error) => error.includes(".schemaVersion:"));
            if (schemaErrors.length > 0) {
                console.log(chalk.gray("\nRun `flisk config migrate` to fix schemaVersion."));
            }
            if (result.diffs.length > 0) {
                console.log(chalk.gray("\nRun `flisk config regenerate` to fix generated files."));
            }
            process.exit(1);
        }
    };
    if (options.json) {
        try {
            await action();
        }
        catch (error) {
            writeMachineError(error);
        }
        return;
    }
    await runCommand(action);
}))
    .addCommand(new Command("explain")
    .description("Explain whether a project file is Flisk-generated and what editing it does on flisk up")
    .argument("<file>", "Project file to explain, relative to the current directory or absolute")
    .option("--json", "Emit a machine-readable explanation")
    .action(async (file, options) => {
    const action = async () => {
        const projectRoot = options.json ? findProjectRoot() : requireProjectRoot();
        if (!projectRoot)
            throw errorFactories.notInProject();
        const explanation = explainConfigFile(projectRoot, file);
        if (options.json) {
            console.log(JSON.stringify(createMachineEnvelope(explanation)));
            return;
        }
        console.log(chalk.blue(`${explanation.file}\n`));
        console.log(`  Ownership: ${explanation.ownership}`);
        console.log(`  ${explanation.reason}`);
        if (explanation.source)
            console.log(`  Source: ${explanation.source}`);
        console.log(`  Edited now: ${explanation.isEditedNow ? "yes" : "no"}`);
        console.log(`  Editing it blocks flisk up: ${DRIFT_LABELS[explanation.driftOnUp]}`);
        console.log(chalk.blue("\nNext:"));
        for (const step of explanation.next)
            console.log(chalk.gray(`  - ${step}`));
    };
    if (options.json) {
        try {
            await action();
        }
        catch (error) {
            writeMachineError(error);
        }
        return;
    }
    await runCommand(action);
}))
    .addCommand(new Command("edit").description("Open .flisk/project.json in your $EDITOR").action(async () => {
    await runCommand(async () => {
        const projectRoot = requireProjectRoot();
        const projectJsonPath = join(projectRoot, ".flisk", PROJECT_JSON);
        if (!existsSync(projectJsonPath)) {
            throw new FliskError(".flisk/project.json not found", [
                "Create the project config with: flisk project --yes",
            ]);
        }
        const editor = process.env.EDITOR || "vi";
        console.log(chalk.blue(`Opening ${projectJsonPath} in ${editor}...`));
        const editorParts = editor.trim().split(/\s+/);
        const editorCmd = editorParts[0];
        const editorArgs = [...editorParts.slice(1), projectJsonPath];
        const allowedEditors = [
            "vi",
            "vim",
            "nano",
            "emacs",
            "code",
            "subl",
            "atom",
            "mate",
            "pico",
            "micro",
            "hx",
        ];
        const editorBase = editorCmd.replace(/.*\//, ""); // Remove path prefix for validation
        if (!allowedEditors.includes(editorBase)) {
            console.error(chalk.yellow(`Warning: Unknown editor "${editorCmd}". Using 'vi' instead.`));
            spawnSync("vi", [projectJsonPath], { stdio: "inherit" });
        }
        else {
            spawnSync(editorCmd, editorArgs, { stdio: "inherit" });
        }
        console.log(chalk.green("\n✅ Editor closed."));
        console.log(chalk.gray("Run `flisk config regenerate` to apply changes."));
    });
}));
/**
 * Type guard for optional infrastructure service keys.
 * Validates that a service name is a valid key of the optional_infra object.
 */
function isOptionalInfraKey(service, config) {
    return service in config.optional_infra;
}
async function toggleInfraService(service, enabled, options = {}) {
    const projectRoot = options.json ? findProjectRoot() : requireProjectRoot();
    if (!projectRoot)
        throw errorFactories.notInProject();
    // Validates service is in OPTIONAL_INFRA_SERVICES array
    const validation = validateOptionalInfraService(service);
    if (options.json && !validation.valid) {
        throw new FliskError(validation.error ?? "Invalid infrastructure service", [
            `flisk config ${enabled ? "enable" : "disable"}-infra monitoring`,
        ]);
    }
    assertValid(validation);
    // Verdaccio is a Premium feature - refuse to enable it without a license
    // key that actually grants it, rather than writing a config that
    // generateMasterConfigs will just silently downgrade back to false later.
    if (service === "verdaccio" && enabled) {
        const granted = await hasVerdaccioLicense(projectRoot);
        if (!granted) {
            throw new FliskError("Verdaccio is a Premium feature and requires a license key that grants it. " +
                "Set export FLISK_LICENSE_KEY=<key> (request a Premium license at https://flisk.sh/#waitlist) and try again.", [
                "export FLISK_LICENSE_KEY=<key>",
                "Request a Premium license at https://flisk.sh/#waitlist",
            ]);
        }
    }
    const config = readProjectConfig(projectRoot);
    // Runtime validation: ensure service is a valid key of optional_infra
    if (!isOptionalInfraKey(service, config)) {
        throw new FliskError(`Invalid infrastructure service: "${service}". ` +
            `Must be one of: ${Object.keys(config.optional_infra).join(", ")}`, [`flisk config enable-infra ${Object.keys(config.optional_infra)[0] ?? "monitoring"}`]);
    }
    const wasEnabled = config.optional_infra[service];
    // Type-safe assignment: service is now narrowed to OptionalInfraKey
    config.optional_infra[service] = enabled;
    const projectJsonPath = join(projectRoot, ".flisk", PROJECT_JSON);
    // ProjectConfig is guaranteed to be JSON-serializable
    writeJsonFile(projectJsonPath, config);
    const action = enabled ? "Enabled" : "Disabled";
    console.log(chalk.green(`✓ ${action}: ${service}`));
    console.log(chalk.gray("Run `flisk config regenerate` to apply."));
    return { data: { service, enabled, wasEnabled: Boolean(wasEnabled) } };
}
/** `flisk config enable-infra` and `disable-infra`: the same command with the other value. */
function infraToggleCommand(name, enabled) {
    return new Command(name)
        .description(`${enabled ? "Enable" : "Disable"} optional infrastructure service`)
        .argument("<service>", "Service name (monitoring, elk, debezium, golden_image, verdaccio)")
        .option("--json", "Print one JSON envelope on stdout with the service and its previous state", false)
        .action(async (service, options) => {
        const action = () => toggleInfraService(service, enabled, options);
        if (options.json) {
            await runJsonCommand("INFRA_TOGGLE_FAILED", `flisk config ${name}`, action);
            return;
        }
        await runCommand(action);
    });
}
configCommand
    .addCommand(infraToggleCommand("enable-infra", true))
    .addCommand(infraToggleCommand("disable-infra", false));
