// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { hasVerdaccioLicense } from "../generator/extension-fetch.js";
import {
  generateMasterConfigs,
  readProjectConfig,
  TemplateEngine,
  verifyMasterConfigs,
} from "../generator/template-engine.js";
import type { ProjectConfig } from "../types/index.js";
import { isMasterConfigFileName } from "../types/index.js";
import { assertValid, handleDryRun } from "../utils/command-helpers.js";
import { MASTER_CONFIG_FILES, PROJECT_JSON } from "../utils/constants.js";
import { checkPrismaConsistency } from "../utils/doctor-wiring.js";
import { errorFactories, requireProjectRoot, runCommand } from "../utils/errors.js";
import { writeJsonFile } from "../utils/file-helpers.js";
import { createMachineEnvelope, writeMachineError } from "../utils/machine-output.js";
import { findProjectRoot } from "../utils/paths.js";
import {
  SERVICE_MANIFEST_SCHEMA_VERSION,
  validateServiceManifest,
} from "../utils/service-manifest.js";
import { discoverResourcesFromRoot, discoverServiceManifestPaths } from "../utils/services.js";
import { evaluateSharedPlatformPostgres } from "../utils/shared-platform-postgres.js";
import { validateOptionalInfraService } from "../utils/validation.js";

export const configCommand = new Command("config")
  .description("Manage project configuration and regenerate master files")
  .addCommand(
    new Command("regenerate")
      .description("Regenerate all 4 master config files from .tdk/project.json")
      .option("--dry-run", "Show what would change without writing files")
      .action(async (options) => {
        await runCommand(async () => {
          const projectRoot = requireProjectRoot();

          // The plan is the comparison report, so it supplies its own printer rather than the standard pair.
          if (
            handleDryRun(options, "", "", () => {
              console.log(
                chalk.blue("🔍 Dry run - comparing current files with new configuration...\n"),
              );

              const projectConfig = readProjectConfig(projectRoot);
              const engine = new TemplateEngine();
              const newFiles = engine.generateAll(projectConfig);

              const outputDir = join(projectRoot, ".tdk", ".tdk-out");
              const filesToCheck = MASTER_CONFIG_FILES;

              let hasChanges = false;

              for (const filename of filesToCheck) {
                // Runtime validation with type guard eliminates type assertion
                if (!isMasterConfigFileName(filename)) {
                  continue; // Skip unknown files (shouldn't happen with const array)
                }
                const newContent = newFiles[filename];
                const filePath = join(outputDir, filename);

                if (!existsSync(filePath)) {
                  console.log(chalk.yellow(`📁 ${filename}`));
                  console.log(chalk.gray("   Status: NEW (file does not exist)\n"));
                  hasChanges = true;
                  continue;
                }

                const currentContent = readFileSync(filePath, "utf-8");

                if (currentContent === newContent) {
                  console.log(chalk.green(`✓ ${filename}`));
                  console.log(chalk.gray("   Status: No changes\n"));
                } else {
                  console.log(chalk.yellow(`📝 ${filename}`));
                  console.log(chalk.gray("   Status: MODIFIED"));

                  const currentLines = currentContent.split("\n").length;
                  const newLines = newContent.split("\n").length;
                  const lineDiff = newLines - currentLines;

                  if (lineDiff > 0) {
                    console.log(
                      chalk.gray(`   Lines: ${currentLines} → ${newLines} (+${lineDiff})`),
                    );
                  } else if (lineDiff < 0) {
                    console.log(
                      chalk.gray(`   Lines: ${currentLines} → ${newLines} (${lineDiff})`),
                    );
                  } else {
                    console.log(chalk.gray(`   Lines: ${currentLines} (content changed)`));
                  }

                  const currentLinesArr = currentContent.split("\n");
                  const newLinesArr = newContent.split("\n");
                  let firstDiffLine = -1;

                  for (let i = 0; i < Math.max(currentLinesArr.length, newLinesArr.length); i++) {
                    if (currentLinesArr[i] !== newLinesArr[i]) {
                      firstDiffLine = i;
                      break;
                    }
                  }

                  if (firstDiffLine >= 0) {
                    console.log(chalk.gray(`   First change around line ${firstDiffLine + 1}:`));
                    const contextStart = Math.max(0, firstDiffLine - 1);
                    const contextEnd = Math.min(currentLinesArr.length, firstDiffLine + 2);

                    for (let i = contextStart; i < contextEnd; i++) {
                      const line = currentLinesArr[i];
                      const newLine = newLinesArr[i];
                      if (line !== newLine) {
                        if (line !== undefined) {
                          console.log(
                            chalk.red(
                              `     - ${line.substring(0, 60)}${line.length > 60 ? "..." : ""}`,
                            ),
                          );
                        }
                        if (newLine !== undefined) {
                          console.log(
                            chalk.green(
                              `     + ${newLine.substring(0, 60)}${newLine.length > 60 ? "..." : ""}`,
                            ),
                          );
                        }
                      } else {
                        console.log(
                          chalk.gray(
                            `       ${line.substring(0, 60)}${line.length > 60 ? "..." : ""}`,
                          ),
                        );
                      }
                    }
                  }

                  console.log("");
                  hasChanges = true;
                }
              }

              if (hasChanges) {
                console.log(chalk.blue("💡 Run without --dry-run to apply these changes.\n"));
              } else {
                console.log(chalk.green("✅ All files are already up to date!\n"));
              }
            })
          ) {
            return;
          }

          console.log(chalk.blue("📋 Regenerating master configuration files...\n"));
          await generateMasterConfigs(projectRoot, { discardHandEdits: true });
          console.log(chalk.green("\n✅ Configuration regenerated!"));
        });
      }),
  )
  .addCommand(
    new Command("migrate")
      .description("Migrate service.json files to the current schema version")
      .action(async () => {
        await runCommand(async () => {
          const projectRoot = requireProjectRoot();
          const failures: string[] = [];
          const pendingMigrations: Array<{ filePath: string; manifest: Record<string, unknown> }> =
            [];

          for (const filePath of discoverServiceManifestPaths(projectRoot)) {
            let manifest: unknown;
            try {
              manifest = JSON.parse(readFileSync(filePath, "utf-8"));
            } catch (error) {
              failures.push(
                `${filePath}: ${error instanceof Error ? error.message : String(error)}`,
              );
              continue;
            }
            if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
              failures.push(`${filePath}: expected a JSON object`);
              continue;
            }

            const record = manifest as Record<string, unknown>;
            if (record.appType === undefined && typeof record.type === "string") {
              record.appType = record.type;
            }
            if (record.schemaVersion === SERVICE_MANIFEST_SCHEMA_VERSION) continue;
            if (record.schemaVersion !== undefined) {
              failures.push(
                `${filePath}.schemaVersion: cannot migrate unsupported version ${String(record.schemaVersion)} automatically`,
              );
              continue;
            }

            const validation = validateServiceManifest(
              { ...record, schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION },
              filePath,
            );
            if (validation.errors.length > 0) {
              failures.push(...validation.errors);
              continue;
            }
            for (const warning of validation.warnings) {
              console.warn(chalk.yellow(`⚠️  ${warning}`));
            }

            record.schemaVersion = SERVICE_MANIFEST_SCHEMA_VERSION;
            pendingMigrations.push({ filePath, manifest: record });
          }

          for (const failure of failures) console.error(chalk.red(`❌ ${failure}`));
          if (failures.length > 0) process.exit(1);
          for (const migration of pendingMigrations) {
            writeFileSync(migration.filePath, `${JSON.stringify(migration.manifest, null, 2)}\n`);
          }
          const migrated = pendingMigrations.length;
          console.log(
            chalk.green(
              `✅ Migrated ${migrated} service.json file${migrated === 1 ? "" : "s"} to schema version ${SERVICE_MANIFEST_SCHEMA_VERSION}.`,
            ),
          );
          console.log(chalk.yellow("Review the diff; unknown fields were preserved."));
        });
      }),
  )
  .addCommand(
    new Command("verify")
      .description("Verify that generated files match .tdk/project.json")
      .option("--json", "Emit a machine-readable verification report")
      .action(async (options) => {
        const action = async (): Promise<void> => {
          const projectRoot = options.json ? findProjectRoot() : requireProjectRoot();
          if (!projectRoot) throw errorFactories.notInProject();

          const result = verifyMasterConfigs(projectRoot);
          const resources = discoverResourcesFromRoot(projectRoot);
          // Same predicate as tdk doctor's Shared platform Postgres check.
          const sharedPostgres = evaluateSharedPlatformPostgres(projectRoot, resources);
          const prismaConsistency = checkPrismaConsistency(projectRoot, resources);
          const sharedPostgresErrors = sharedPostgres.unknownDependsOnNames.map(
            ({ resource, name }) =>
              `dependsOn "${name}" on ${resource} is not a known service or stack (shared platform Postgres names are postgres and database-management)`,
          );

          if (options.json) {
            console.log(
              JSON.stringify(
                createMachineEnvelope({
                  valid:
                    result.valid && sharedPostgresErrors.length === 0 && prismaConsistency.didPass,
                  errors: [
                    ...result.errors,
                    ...sharedPostgresErrors,
                    ...(prismaConsistency.didPass ? [] : [prismaConsistency.message]),
                  ],
                  warnings: result.warnings,
                  diffs: result.diffs,
                  sharedPlatformPostgres: sharedPostgres,
                }),
              ),
            );
            if (!result.valid || sharedPostgresErrors.length > 0 || !prismaConsistency.didPass)
              process.exit(1);
            return;
          }

          console.log(chalk.blue("🔍 Verifying configuration...\n"));

          for (const warning of result.warnings) {
            console.warn(chalk.yellow(`⚠️  ${warning}`));
          }

          for (const error of sharedPostgresErrors) {
            console.log(chalk.red(`❌ ${error}`));
          }
          if (!prismaConsistency.didPass) console.log(chalk.red(`❌ ${prismaConsistency.message}`));

          if (sharedPostgres.willStart) {
            // Project resource set (discoverResourcesFromRoot), not a tdk up --only filter.
            // Feature-on alone is not new behavior — print gray so default projects are not noisy.
            // dependsOn is the reason Postgres starts when the feature is off — green.
            if (sharedPostgres.reason === "feature" && sharedPostgres.dependsOnUsers.length === 0) {
              const source =
                sharedPostgres.featureOnFromTiltfile || sharedPostgres.featureOnFromSpecMaster
                  ? " (generated Tiltfile/spec.master)"
                  : "";
              console.log(
                chalk.gray(
                  `ℹ️  Postgres will start because database-management is enabled${source} (project-wide; not a tdk up selection)`,
                ),
              );
            } else if (sharedPostgres.reason === "feature") {
              console.log(
                chalk.yellow(
                  `ℹ️  Postgres will start because database-management is enabled and resource(s) ${sharedPostgres.dependsOnUsers.join(", ")} depend on postgres/database-management (project resource set; tdk up may select a subset)`,
                ),
              );
            } else {
              console.log(
                chalk.green(
                  `ℹ️  Postgres will start because resource(s) ${sharedPostgres.dependsOnUsers.join(", ")} depend on postgres/database-management (project resource set; tdk up may select a subset)`,
                ),
              );
            }
          } else if (sharedPostgres.focusWouldEnableDatabaseManagement) {
            console.log(
              chalk.yellow(
                "ℹ️  Postgres will not start from project.json/generated Tiltfile, but default focus/CORE_INFRA expansion would enable database-management on a typical tdk up",
              ),
            );
          }

          if (result.valid && sharedPostgresErrors.length === 0 && prismaConsistency.didPass) {
            console.log(chalk.green("✅ All files are in sync!"));
            return;
          } else {
            console.log(chalk.yellow("⚠️  Configuration issues found:"));
            for (const error of result.errors) {
              console.log(chalk.gray(`   - ${error}`));
            }
            for (const { diff } of result.diffs) console.log(chalk.gray(`\n${diff}`));
            const schemaErrors = result.errors.filter((error) => error.includes(".schemaVersion:"));
            if (schemaErrors.length > 0) {
              console.log(chalk.gray("\nRun `tdk config migrate` to fix schemaVersion."));
            }
            if (result.diffs.length > 0) {
              console.log(chalk.gray("\nRun `tdk config regenerate` to fix generated files."));
            }
            process.exit(1);
          }
        };

        if (options.json) {
          try {
            await action();
          } catch (error) {
            writeMachineError(error);
          }
          return;
        }
        await runCommand(action);
      }),
  )
  .addCommand(
    new Command("edit").description("Open .tdk/project.json in your $EDITOR").action(async () => {
      await runCommand(async () => {
        const projectRoot = requireProjectRoot();

        const projectJsonPath = join(projectRoot, ".tdk", PROJECT_JSON);
        if (!existsSync(projectJsonPath)) {
          throw new Error(".tdk/project.json not found");
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
          console.error(
            chalk.yellow(`Warning: Unknown editor "${editorCmd}". Using 'vi' instead.`),
          );
          spawnSync("vi", [projectJsonPath], { stdio: "inherit" });
        } else {
          spawnSync(editorCmd, editorArgs, { stdio: "inherit" });
        }

        console.log(chalk.green("\n✅ Editor closed."));
        console.log(chalk.gray("Run `tdk config regenerate` to apply changes."));
      });
    }),
  );

/**
 * Type guard for optional infrastructure service keys.
 * Validates that a service name is a valid key of the optional_infra object.
 */
function isOptionalInfraKey(
  service: string,
  config: ProjectConfig,
): service is keyof ProjectConfig["optional_infra"] {
  return service in config.optional_infra;
}

async function toggleInfraService(service: string, enabled: boolean): Promise<void> {
  const projectRoot = requireProjectRoot();

  // Validates service is in OPTIONAL_INFRA_SERVICES array
  const validation = validateOptionalInfraService(service);
  assertValid(validation);

  // Verdaccio is a Premium feature - refuse to enable it without a license
  // key that actually grants it, rather than writing a config that
  // generateMasterConfigs will just silently downgrade back to false later.
  if (service === "verdaccio" && enabled) {
    const granted = await hasVerdaccioLicense(projectRoot);
    if (!granted) {
      throw new Error(
        "Verdaccio is a Premium feature and requires a license key that grants it. " +
          "Set export TDK_LICENSE_KEY=<key> (request a Premium license at https://tdk-landscape.github.io/tdk-website/#waitlist) and try again.",
      );
    }
  }

  const config = readProjectConfig(projectRoot);

  // Runtime validation: ensure service is a valid key of optional_infra
  if (!isOptionalInfraKey(service, config)) {
    throw new Error(
      `Invalid infrastructure service: "${service}". ` +
        `Must be one of: ${Object.keys(config.optional_infra).join(", ")}`,
    );
  }

  // Type-safe assignment: service is now narrowed to OptionalInfraKey
  config.optional_infra[service] = enabled;

  const projectJsonPath = join(projectRoot, ".tdk", PROJECT_JSON);
  // ProjectConfig is guaranteed to be JSON-serializable
  writeJsonFile(projectJsonPath, config as unknown);

  const action = enabled ? "Enabled" : "Disabled";
  console.log(chalk.green(`✓ ${action}: ${service}`));
  console.log(chalk.gray("Run `tdk config regenerate` to apply."));
}

configCommand
  .addCommand(
    new Command("enable-infra")
      .description("Enable optional infrastructure service")
      .argument("<service>", "Service name (monitoring, elk, debezium, golden_image, verdaccio)")
      .action(async (service) => {
        await runCommand(async () => {
          await toggleInfraService(service, true);
        });
      }),
  )
  .addCommand(
    new Command("disable-infra")
      .description("Disable optional infrastructure service")
      .argument("<service>", "Service name (monitoring, elk, debezium, golden_image, verdaccio)")
      .action(async (service) => {
        await runCommand(async () => {
          await toggleInfraService(service, false);
        });
      }),
  );
