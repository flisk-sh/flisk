// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { hasVerdaccioLicense } from "../generator/extension-fetch.js";
import { generateMasterConfigs, readProjectConfig, staleServiceOutputs, TemplateEngine, verifyMasterConfigs, } from "../generator/template-engine.js";
import { isMasterConfigFileName } from "../types/index.js";
import { assertValid, handleDryRun } from "../utils/command-helpers.js";
import { explainConfigFile } from "../utils/config-explain.js";
import { applyMigrationPlan, buildMigrationPlan } from "../utils/config-migrate.js";
import { MASTER_CONFIG_FILES, PROJECT_JSON, RESOURCE_DEFAULTS_FILE, TECH_STACK_FILE, } from "../utils/constants.js";
import { clearDiscoveryCache } from "../utils/discovery-context.js";
import { checkDuplicateResourceNames, checkDuplicateResourcePorts, checkPrismaConsistency, } from "../utils/doctor-wiring.js";
import { errorFactories, FliskError, requireProjectRoot, runCommand, showError, } from "../utils/errors.js";
import { writeJsonFile } from "../utils/file-helpers.js";
import { enforceFliskVersionGate } from "../utils/flisk-version-gate.js";
import { runJsonCommand } from "../utils/json-command.js";
import { createMachineEnvelope, writeMachineError } from "../utils/machine-output.js";
import { isNativeProject } from "../utils/native-service.js";
import { findProjectRoot } from "../utils/paths.js";
import { checkCircularDependencies, checkDependsOnShape, checkServicePorts, postgresVolumeWarnings, } from "../utils/service-config-checks.js";
import { SERVICE_MANIFEST_SCHEMA_VERSION } from "../utils/service-manifest.js";
import { discoverResourcesWithProblems, warnAboutSkippedFiles } from "../utils/services.js";
import { describeSharedPostgresUsers, evaluateSharedPlatformPostgres, } from "../utils/shared-platform-postgres.js";
import { validateOptionalInfraService } from "../utils/validation.js";
/** The change `flisk config regenerate` makes to each master file, from the same generator its dry run compares with. */
export function regeneratePlan(projectRoot) {
    const newFiles = new TemplateEngine().generateAll(readProjectConfig(projectRoot), {
        projectRoot,
    });
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
    .option("--ignore-version", "Continue even if the CLI does not match the project's version requirements", false)
    .option("--json", "Print one JSON envelope on stdout with each master file's change (new, modified, unchanged)", false)
    .action(async (options) => {
    if (options.json) {
        await runJsonCommand("REGENERATE_FAILED", "flisk config regenerate", async () => {
            const projectRoot = findProjectRoot();
            if (!projectRoot)
                throw errorFactories.notInProject();
            enforceFliskVersionGate(projectRoot, {
                ignoreVersion: options.ignoreVersion,
                json: options.json,
            });
            const changes = regeneratePlan(projectRoot);
            if (!options.dryRun) {
                await generateMasterConfigs(projectRoot, { discardHandEdits: true, quiet: true });
            }
            return {
                data: {
                    dryRun: Boolean(options.dryRun),
                    hasChanges: changes.some((change) => change.status !== "unchanged"),
                    changes,
                    // Written by `flisk up`, not by regenerate: listed so a caller does not take "regenerated" for "up to date".
                    staleServiceOutputs: staleServiceOutputs(projectRoot),
                },
            };
        });
        return;
    }
    await runCommand(async () => {
        const projectRoot = requireProjectRoot();
        enforceFliskVersionGate(projectRoot, {
            ignoreVersion: options.ignoreVersion,
            json: options.json,
        });
        // The plan is the comparison report, so it supplies its own printer rather than the standard pair.
        if (handleDryRun(options, "", "", () => {
            console.log(chalk.blue("🔍 Dry run - comparing current files with new configuration...\n"));
            const projectConfig = readProjectConfig(projectRoot);
            const engine = new TemplateEngine();
            const newFiles = engine.generateAll(projectConfig, { projectRoot });
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
                                else if (line !== undefined) {
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
        console.log(chalk.gray("   If a stack is already running, restart it (`flisk down && flisk up`) so Tilt applies changes to enabled resources."));
        const stale = staleServiceOutputs(projectRoot);
        if (stale.length > 0) {
            console.log(chalk.yellow(`\n⚠️  ${stale.length} service${stale.length === 1 ? "" : "s"} still ${stale.length === 1 ? "has" : "have"} generated files (compose, Dockerfile) written from an older service.json:`));
            for (const file of stale)
                console.log(chalk.gray(`   ${file}`));
            console.log(chalk.gray("   `flisk config regenerate` rewrites the master files only; `flisk up` writes these, and `flisk config verify` reports them until then."));
        }
    });
}))
    .addCommand(new Command("migrate")
    .description("Migrate service.json files to the current schema version")
    .option("--ignore-version", "Continue even if the CLI does not match the project's version requirements", false)
    .option("--dry-run", "List the service.json files that would be rewritten, without writing", false)
    .option("--json", "Print one JSON envelope on stdout with the migrated files", false)
    .addHelpText("after", `\nExamples:\n  flisk config migrate\n  flisk config migrate --dry-run\n  flisk config migrate --json`)
    .action(async (options) => {
    const action = async () => {
        const projectRoot = options.json ? findProjectRoot() : requireProjectRoot();
        if (!projectRoot)
            throw errorFactories.notInProject();
        enforceFliskVersionGate(projectRoot, {
            ignoreVersion: options.ignoreVersion,
            json: options.json,
        });
        // One read-only plan feeds both the dry run and the real run, so their file lists agree.
        const plan = buildMigrationPlan(projectRoot);
        const files = plan.pending.map(({ filePath }) => relative(projectRoot, filePath).split(sep).join("/"));
        const report = (dryRun) => ({
            data: {
                dryRun,
                schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION,
                migrated: files,
                warnings: plan.warnings,
            },
        });
        // Nothing is written when one file fails, so a failed run leaves every service.json as it was.
        if (options.json && plan.failures.length > 0) {
            return {
                data: null,
                errors: plan.failures.map((message) => ({
                    code: "MIGRATE_FAILED",
                    message,
                    suggestions: ["Fix the file, then run `flisk config migrate` again"],
                })),
                exitCode: 1,
            };
        }
        for (const failure of plan.failures)
            showError(failure);
        if (plan.failures.length > 0)
            process.exit(1);
        for (const warning of plan.warnings) {
            console.warn(chalk.yellow(`⚠️  ${warning}`));
        }
        if (handleDryRun(options, `${plan.pending.length} service.json file${plan.pending.length === 1 ? "" : "s"} to schema version ${SERVICE_MANIFEST_SCHEMA_VERSION}`, "flisk config migrate")) {
            for (const file of files)
                console.log(`Would rewrite: ${file}`);
            if (files.length === 0)
                console.log("Nothing to migrate.");
            console.log("No files were written.");
            return report(true);
        }
        applyMigrationPlan(plan);
        if (plan.pending.length > 0) {
            clearDiscoveryCache();
        }
        const migrated = plan.pending.length;
        if (migrated === 0) {
            console.log(chalk.green(`All ${plan.totalFiles} service.json files are already on schema version ${SERVICE_MANIFEST_SCHEMA_VERSION}. Nothing to migrate.`));
        }
        else {
            console.log(chalk.green(`✅ Migrated ${migrated} service.json file${migrated === 1 ? "" : "s"} to schema version ${SERVICE_MANIFEST_SCHEMA_VERSION}.`));
            console.log(chalk.yellow("Review the diff; unknown fields were preserved."));
        }
        return report(false);
    };
    if (options.json) {
        await runJsonCommand("MIGRATE_FAILED", "flisk config migrate", action);
        return;
    }
    await runCommand(action);
}))
    .addCommand(new Command("verify")
    .description("Verify that generated files match .flisk/project.json")
    .option("--ignore-version", "Continue even if the CLI does not match the project's version requirements", false)
    .option("--json", "Emit a machine-readable verification report")
    .addHelpText("after", `\nExamples:\n  flisk config verify\n  flisk config verify --json`)
    .action(async (options) => {
    const action = async () => {
        const projectRoot = options.json ? findProjectRoot() : requireProjectRoot();
        if (!projectRoot)
            throw errorFactories.notInProject();
        enforceFliskVersionGate(projectRoot, {
            ignoreVersion: options.ignoreVersion,
            json: options.json,
        });
        const { resources, problems } = discoverResourcesWithProblems(projectRoot);
        warnAboutSkippedFiles(problems);
        const manifestPaths = [
            ...resources.map((r) => r.configPath),
            ...problems.map((p) => p.path),
        ];
        const verified = verifyMasterConfigs(projectRoot, { manifestPaths });
        // Warnings only: Postgres 18+ with a volume at the pre-18 path is valid config that will not start, and two
        // routed resources on one port still run (each in its own container) but is usually a copied service.json.
        const duplicatePorts = checkDuplicateResourcePorts(projectRoot, resources);
        const result = {
            ...verified,
            warnings: [
                ...verified.warnings,
                ...postgresVolumeWarnings(projectRoot, resources),
                ...(duplicatePorts.didPass
                    ? []
                    : [`${duplicatePorts.message}\n    Fix: ${duplicatePorts.fix}`]),
            ],
        };
        // Same predicate as flisk doctor's Shared platform Postgres check.
        const sharedPostgres = evaluateSharedPlatformPostgres(projectRoot, resources);
        const prismaConsistency = checkPrismaConsistency(projectRoot, resources);
        // A duplicate appName, a wrong-typed dependsOn, a circular dependsOn and an invalid port are what `flisk up` refuses,
        // so verify says the same.
        const graphErrors = [
            checkDuplicateResourceNames(projectRoot, resources),
            checkDependsOnShape(projectRoot, resources),
            checkCircularDependencies(projectRoot, resources),
            checkServicePorts(projectRoot, resources),
        ]
            .filter((check) => !check.didPass)
            .map((check) => check.fix ? `${check.message}\n    Fix: ${check.fix}` : check.message);
        const sharedPostgresErrors = [
            ...graphErrors,
            ...sharedPostgres.unknownDependsOnNames.map(({ resource, name }) => `dependsOn "${name}" on ${resource} is not a known service or stack (shared platform Postgres names are postgres and database-management)`),
        ];
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
                state: result.state,
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
        if (!isNativeProject(resources) && sharedPostgres.willStart) {
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
                console.log(chalk.yellow(`ℹ️  Postgres will start because database-management is enabled and ${describeSharedPostgresUsers(sharedPostgres)} (project resource set; flisk up may select a subset)`));
            }
            else {
                console.log(chalk.green(`ℹ️  Postgres will start because ${describeSharedPostgresUsers(sharedPostgres)} (project resource set; flisk up may select a subset)`));
            }
        }
        else if (!isNativeProject(resources) &&
            sharedPostgres.focusWouldEnableDatabaseManagement) {
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
    .addHelpText("after", `\nExamples:\n  flisk config explain Tiltfile\n  flisk config explain services/orders-api/service.json\n  flisk config explain Tiltfile --json`)
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
        // A pipe, script or CI job cannot answer an editor, and vi would wait on the closed stdin.
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
            throw new FliskError("config edit needs a terminal; edit .flisk/project.json directly", [
                `Edit it in your own editor: ${projectJsonPath}`,
                "Then run `flisk config regenerate` to apply the changes.",
            ]);
        }
        // $VISUAL comes first, as in most editors; an unset or blank value falls through to $EDITOR.
        const editor = process.env.VISUAL?.trim() || process.env.EDITOR?.trim() || "vi";
        console.log(chalk.blue(`Opening ${projectJsonPath} in ${editor}...`));
        // Split into a command and its arguments instead of handing the string to a shell.
        const editorParts = editor.split(/\s+/);
        const editorCmd = editorParts[0] || "vi";
        const editorArgs = [...editorParts.slice(1), projectJsonPath];
        const editorResult = spawnSync(editorCmd, editorArgs, { stdio: "inherit" });
        if (editorResult.error || editorResult.status !== 0) {
            throw new FliskError(`Editor "${editorCmd}" failed`, [
                editorResult.error?.message ??
                    (editorResult.signal
                        ? `Terminated by ${editorResult.signal}`
                        : `Exited with status ${editorResult.status ?? 1}`),
            ]);
        }
        try {
            readProjectConfig(projectRoot);
        }
        catch (error) {
            throw new FliskError("Editor saved an invalid .flisk/project.json", [
                "Fix .flisk/project.json before running `flisk config regenerate`.",
                error instanceof Error ? error.message : String(error),
            ]);
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
    enforceFliskVersionGate(projectRoot, {
        ignoreVersion: options.ignoreVersion,
        json: options.json,
    });
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
    const changes = Boolean(wasEnabled) !== enabled;
    if (options.dryRun) {
        console.log(changes
            ? `Would ${enabled ? "enable" : "disable"} ${service}.`
            : `No change: ${service} is already ${enabled ? "enabled" : "disabled"}.`);
        return {
            data: { dryRun: true, service, enabled, wasEnabled: Boolean(wasEnabled), changed: changes },
        };
    }
    const projectJsonPath = join(projectRoot, ".flisk", PROJECT_JSON);
    const rawProjectValue = JSON.parse(readFileSync(projectJsonPath, "utf-8"));
    if (typeof rawProjectValue !== "object" ||
        rawProjectValue === null ||
        Array.isArray(rawProjectValue)) {
        throw new FliskError("Invalid project.json: expected an object.", [
            "Fix .flisk/project.json so it holds a JSON object",
        ]);
    }
    const rawProject = rawProjectValue;
    const rawOptionalInfra = rawProject.optional_infra;
    if (typeof rawOptionalInfra !== "object" ||
        rawOptionalInfra === null ||
        Array.isArray(rawOptionalInfra)) {
        throw new FliskError("Invalid project.json: optional_infra must be an object.", [
            "Set optional_infra in .flisk/project.json to an object, or remove it",
        ]);
    }
    rawOptionalInfra[service] = enabled;
    writeJsonFile(projectJsonPath, rawProject);
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
        .option("--dry-run", "Show the planned change without writing project.json")
        .option("--ignore-version", "Continue even if the CLI does not match the project's version requirements", false)
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
