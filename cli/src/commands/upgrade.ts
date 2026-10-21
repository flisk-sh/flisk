// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { Command } from "commander";
import { addYesOption, handleDryRun } from "../utils/command-helpers.js";
import { PACKAGE_JSON } from "../utils/constants.js";
import { getErrorMessage, logVerbose, showErrorAndExit } from "../utils/errors.js";
import { showCancelled } from "../utils/formatting.js";
import { getPackageVersion } from "../utils/paths.js";
import {
  binaryAssetName,
  executableName,
  isWindows,
  legacyExecutableName,
} from "../utils/platform.js";
import { promptConfirm } from "../utils/prompt.js";
import { startSpinner } from "../utils/spinner.js";
import { extractTarball } from "../utils/tar.js";
import { findAllOnPath, findOnPath } from "../utils/which.js";

/** @internal Exported for unit tests only; not part of the package API. */
export interface InstallInfo {
  method: "npm" | "bun" | "git" | "binary" | "unknown";
  path?: string;
  version?: string;
}

/** @internal Exported for unit tests only; not part of the package API. */
export function isStandaloneBinary(tdkPath: string): boolean {
  if (isWindows() && tdkPath.toLowerCase().endsWith(".exe")) return true;
  try {
    const fileInfo = execFileSync("file", ["-b", tdkPath], { encoding: "utf-8" });
    return /Mach-O|ELF/.test(fileInfo);
  } catch (err: unknown) {
    logVerbose("Binary detection (file command) error", err);
    return false;
  }
}

/** @internal Exported for unit tests only; not part of the package API. */
export function classifyRunningInstall(
  execPath: string,
  scriptPath: string,
  platformName = process.platform,
): InstallInfo | null {
  const runningName = (
    platformName === "win32" ? win32.basename(execPath) : basename(execPath)
  ).toLowerCase();
  const isFliskBinary =
    runningName === "flisk" ||
    runningName === "flisk.exe" ||
    runningName === "tdk" ||
    runningName === "tdk.exe";
  if (isFliskBinary) {
    return { method: "binary", path: execPath };
  }
  if (runningName === "node" || runningName === "node.exe") {
    const normalizedScriptPath = scriptPath.toLowerCase();
    if (normalizedScriptPath.includes("node_modules") || normalizedScriptPath.includes(".npm")) {
      return { method: "npm", path: scriptPath };
    }
  }
  return null;
}

/** @internal Exported for unit tests only; not part of the package API. */
export function windowsNpmUpgradeMessage(
  platformName: string,
  installInfo: InstallInfo,
): string | null {
  return platformName === "win32" && installInfo.method === "npm"
    ? "use npm install -g @flisk-sh/flisk@latest"
    : null;
}

/** @internal Exported for unit tests only; not part of the package API. */
export function detectInstallation(): InstallInfo {
  const runningPath = process.execPath;
  const runningInstall = classifyRunningInstall(runningPath, process.argv[1] ?? "");
  if (runningInstall) return runningInstall;
  try {
    const tdkPath = findOnPath(executableName()) ?? findOnPath(legacyExecutableName());
    if (!tdkPath) return { method: "unknown" };

    // `readlink -f` is not available on macOS. Use Node's cross-platform
    // realpath implementation so standalone binaries are detected there too.
    const realPath = realpathSync(tdkPath);
    // If the real path contains tdk-cli and has .git, it's a linked git install
    if (realPath.includes("tdk-cli")) {
      const possibleGitRoot = resolve(realPath, "..", "..", "..");
      if (existsSync(join(possibleGitRoot, ".git"))) {
        return { method: "git", path: possibleGitRoot };
      }
    }

    if (tdkPath.includes("node_modules") || tdkPath.includes(".npm") || tdkPath.includes(".bun")) {
      if (tdkPath.includes(".bun")) {
        return { method: "bun", path: tdkPath };
      }
      return { method: "npm", path: tdkPath };
    }

    const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    if (existsSync(join(cliRoot, ".git"))) {
      return { method: "git", path: cliRoot };
    }

    // Standalone prebuilt binary from tdk-cli-releases (installed to e.g. /usr/local/bin),
    // not a node_modules/.bun link and not sitting inside a git checkout.
    if (isStandaloneBinary(realPath)) {
      return { method: "binary", path: realPath };
    }

    return { method: "unknown", path: tdkPath };
  } catch (err: unknown) {
    console.warn(chalk.yellow("⚠️ Could not detect installation method"));
    logVerbose("Installation detection error", err);
    return { method: "unknown" };
  }
}

/** @internal Exported for unit tests only; not part of the package API. */
export function detectInstallationForPath(tdkPath: string): InstallInfo {
  try {
    const realPath = realpathSync(tdkPath);
    if (realPath.includes("tdk-cli")) {
      const possibleGitRoot = resolve(realPath, "..", "..", "..");
      if (existsSync(join(possibleGitRoot, ".git"))) {
        return { method: "git", path: possibleGitRoot };
      }
    }
    if (tdkPath.includes("node_modules") || tdkPath.includes(".npm") || tdkPath.includes(".bun")) {
      return { method: tdkPath.includes(".bun") ? "bun" : "npm", path: tdkPath };
    }
    if (isStandaloneBinary(realPath)) return { method: "binary", path: realPath };
  } catch (err: unknown) {
    logVerbose(`Installation detection failed for ${tdkPath}`, err);
  }
  return { method: "unknown", path: tdkPath };
}

/** @internal Exported for unit tests only; not part of the package API. */
export function detectAllInstallations(): InstallInfo[] {
  const candidates = findAllOnPath(executableName()).map(detectInstallationForPath);
  const current = detectInstallation();
  if (current.method !== "unknown") candidates.unshift(current);
  const unique = new Map<string, InstallInfo>();
  for (const install of candidates) {
    if (install.method === "unknown" || !install.path) continue;
    let key = install.path;
    try {
      if (install.method === "binary") key = realpathSync(install.path);
    } catch {}
    unique.set(`${install.method}:${key}`, install);
  }
  return [...unique.values()];
}

const BINARY_RELEASE_REPO = "flisk-sh/tdk-cli-releases";

const ENGINE_ASSET_NAME = "flisk-cli-engine.tar.gz";
const CHECKSUMS_ASSET_NAME = "checksums.txt";

/** @internal Exported for unit tests only; not part of the package API. */
export interface BinaryRelease {
  tag: string;
  assetName: string;
  downloadUrl: string;
  engineDownloadUrl: string;
  checksumsUrl: string;
}

/** Parses `shasum -a 256` / `sha256sum` output ("<hash>  <name>" or "<hash> *<name>"). */
/** @internal Exported for unit tests only; not part of the package API. */
export function parseChecksums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    if (match) sums.set(match[2].trim(), match[1].toLowerCase());
  }
  return sums;
}

/**
 * Throws unless `filePath` hashes to the checksum listed for `assetName`.
 * A missing entry is an error when `required`; otherwise it is skipped, so
 * releases published before an asset was added to checksums.txt (older
 * releases list only the binaries, not the engine tarball) still install.
 */
function verifyChecksum(
  filePath: string,
  assetName: string,
  sums: Map<string, string>,
  required: boolean,
): void {
  const expected = sums.get(assetName);
  if (!expected) {
    if (required) throw new Error(`${CHECKSUMS_ASSET_NAME} has no entry for ${assetName}`);
    logVerbose(`${CHECKSUMS_ASSET_NAME} has no entry for ${assetName}; skipping verification`);
    return;
  }
  const actual = createHash("sha256").update(readFileSync(filePath)).digest("hex");
  if (actual !== expected) {
    throw new Error(
      `${isWindows() ? "checksum mismatch" : "Checksum mismatch"} for ${assetName} (expected ${expected}, got ${actual})`,
    );
  }
}

/** @internal Exported for unit tests only; not part of the package API. */
export async function getLatestBinaryRelease(): Promise<BinaryRelease | null> {
  const assetName = binaryAssetName();
  if (!assetName) return null;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${BINARY_RELEASE_REPO}/releases/latest`,
      {
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { tag_name?: string };
    if (!data.tag_name) return null;

    return {
      tag: data.tag_name,
      assetName,
      downloadUrl: `https://github.com/${BINARY_RELEASE_REPO}/releases/download/${data.tag_name}/${assetName}`,
      engineDownloadUrl: `https://github.com/${BINARY_RELEASE_REPO}/releases/download/${data.tag_name}/${ENGINE_ASSET_NAME}`,
      checksumsUrl: `https://github.com/${BINARY_RELEASE_REPO}/releases/download/${data.tag_name}/${CHECKSUMS_ASSET_NAME}`,
    };
  } catch (err: unknown) {
    logVerbose("Binary release lookup error", err);
    return null;
  }
}

/** @internal Exported for unit tests only; not part of the package API. */
export function isPermissionError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === "EACCES" || code === "EPERM";
}

/** @internal Exported for unit tests only; not part of the package API. */
export function isWritable(path: string): boolean {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** @internal Exported for unit tests only; not part of the package API. */
export async function upgradeViaBinary(tdkPath: string, release: BinaryRelease): Promise<boolean> {
  // Never shells out to sudo - if the install dir isn't user-writable, fail
  // fast with the manual curl command instead of downloading first and
  // elevating automatically. The user runs that curl themselves.
  const installDir = dirname(tdkPath);
  if (!isWritable(installDir)) {
    console.log(chalk.yellow(`\n🔒 ${installDir} isn't writable by your user.`));
    console.log(chalk.yellow("💡 Upgrade manually instead:"));
    if (isWindows()) {
      console.log(
        chalk.cyan("   Install Flisk in a user-writable directory, then retry the upgrade."),
      );
    } else {
      console.log(chalk.cyan(`   curl -fsSL -o ${tdkPath} ${release.downloadUrl}`));
      console.log(chalk.cyan(`   chmod +x ${tdkPath}`));
    }
    return false;
  }

  const spinner = startSpinner(`Downloading ${release.assetName} (${release.tag})...`);
  const tempDir = join(installDir, `.tdk-upgrade-${process.pid}-${Date.now()}`);
  const tmpPath = join(tempDir, release.assetName);
  const engineTmpPath = join(tempDir, "engine.tar.gz");
  const engineDir = join(installDir, "tdk-cli");
  const engineStageDir = join(tempDir, "tdk-cli");
  const binaryBackup = join(tempDir, `${basename(tdkPath)}.previous`);
  const engineBackup = join(tempDir, "tdk-cli.previous");

  try {
    mkdirSync(tempDir, { recursive: true });
    const binaryResponse = await fetch(release.downloadUrl, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!binaryResponse.ok) throw new Error(`Download failed (${binaryResponse.status})`);
    writeFileSync(tmpPath, Buffer.from(await binaryResponse.arrayBuffer()));

    // The compiled binary has no source checkout to find engine/ or
    // cli/templates/ in, so it looks for a tdk-cli/ folder next to itself
    // (see template-engine.ts loadTemplate() / vendorTdkExtension()).
    // `flisk upgrade` only used to swap the binary, leaving that folder
    // stale/missing after an upgrade - refresh it here too, every time,
    // the same way install.sh does on a fresh install.
    spinner.text = `Downloading bundled engine (${release.tag})...`;
    const engineResponse = await fetch(release.engineDownloadUrl, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!engineResponse.ok) throw new Error(`Engine download failed (${engineResponse.status})`);
    const engineBuffer = Buffer.from(await engineResponse.arrayBuffer());
    writeFileSync(engineTmpPath, engineBuffer);

    // Verify both downloads against the release's checksums.txt before
    // touching the installed binary or engine.
    spinner.text = `Verifying checksums (${release.tag})...`;
    const checksumResponse = await fetch(release.checksumsUrl, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!checksumResponse.ok)
      throw new Error(`Checksum download failed (${checksumResponse.status})`);
    const sums = parseChecksums(await checksumResponse.text());
    verifyChecksum(tmpPath, release.assetName, sums, true);
    verifyChecksum(engineTmpPath, ENGINE_ASSET_NAME, sums, false);

    // writeFileSync creates the file 0644; without this the swapped-in binary
    // is not executable and the shell reports "Permission denied".
    if (!isWindows()) chmodSync(tmpPath, 0o755);

    mkdirSync(engineStageDir, { recursive: true });
    extractTarball(engineBuffer, engineStageDir);

    if (existsSync(tdkPath)) renameSync(tdkPath, binaryBackup);
    try {
      renameSync(tmpPath, tdkPath);
    } catch (err) {
      if (existsSync(binaryBackup)) renameSync(binaryBackup, tdkPath);
      throw err;
    }
    if (existsSync(engineDir)) renameSync(engineDir, engineBackup);
    try {
      renameSync(engineStageDir, engineDir);
    } catch (err) {
      if (existsSync(engineBackup)) renameSync(engineBackup, engineDir);
      if (existsSync(binaryBackup)) {
        rmSync(tdkPath, { force: true });
        renameSync(binaryBackup, tdkPath);
      }
      throw err;
    }
    rmSync(binaryBackup, { force: true });
    rmSync(engineBackup, { recursive: true, force: true });

    spinner.succeed(`Upgraded to ${release.tag}`);
    return true;
  } catch (err: unknown) {
    spinner.fail(`Binary upgrade failed: ${getErrorMessage(err)}`);
    logVerbose("Binary upgrade error", err);
    console.log(
      chalk.yellow(
        "\n💡 If this failed due to permissions, use the platform installer or install command.",
      ),
    );
    return false;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

/** @internal Exported for unit tests only; not part of the package API. */
export function getCurrentVersion(): string {
  try {
    return getPackageVersion();
  } catch (err: unknown) {
    logVerbose("Version detection error", err);
    return "unknown";
  }
}

/** @internal Exported for unit tests only; not part of the package API. */
export async function getLatestVersion(): Promise<string | null> {
  const spinner = startSpinner("Checking for latest version...");

  try {
    let result: string;
    if (isWindows()) {
      const response = await fetch("https://registry.npmjs.org/@flisk-sh%2fflisk/latest", {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`npm registry returned ${response.status}`);
      const latest = (await response.json()) as { version?: string };
      result = latest.version ?? "";
      if (!result) throw new Error("npm registry response did not include a version");
    } else {
      result = execSync("npm view @flisk-sh/flisk version", {
        encoding: "utf-8",
        timeout: 10000,
      }).trim();
    }
    spinner.succeed(`Latest version: ${chalk.green(result)}`);
    return result;
  } catch (err: unknown) {
    logVerbose("npm registry check failed", err);
    spinner.warn("Could not check the npm registry");
    console.log(chalk.yellow("\nInstall the latest published release manually:"));
    console.log(chalk.cyan("   npm install -g @flisk-sh/flisk@latest"));
    console.log(chalk.cyan("   bun install -g @flisk-sh/flisk@latest"));
    return null;
  }
}

/** @internal Exported for unit tests only; not part of the package API. */
export async function upgradeViaNpm(): Promise<boolean> {
  const spinner = startSpinner("Upgrading via npm...");

  try {
    execSync("npm install -g @flisk-sh/flisk@latest", {
      stdio: ["inherit", "inherit", "pipe"],
      timeout: 120000,
    });
    spinner.succeed("Upgraded successfully via npm");
    return true;
  } catch (err: unknown) {
    const errorStderr =
      err && typeof err === "object" && "stderr" in err
        ? String((err as { stderr?: unknown }).stderr ?? "")
        : "";
    if (errorStderr) process.stderr.write(errorStderr);

    logVerbose("npm upgrade error", err);
    spinner.fail(`npm upgrade failed: ${getErrorMessage(err)}`);
    console.log(chalk.yellow("\nTo retry manually, install the latest published npm release:"));
    console.log(chalk.cyan("   npm install -g @flisk-sh/flisk@latest"));

    const errorCode =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code ?? "")
        : "";
    if (
      /EACCES|EPERM|permission denied/i.test(`${errorCode} ${getErrorMessage(err)} ${errorStderr}`)
    ) {
      console.log(
        chalk.gray("\nFor EACCES or EPERM, fix npm's global prefix or use the binary installer:"),
      );
      console.log(
        chalk.cyan(
          "   https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally/",
        ),
      );
      console.log(
        chalk.cyan(
          isWindows()
            ? "   irm https://tdk-landscape.github.io/install.ps1 | iex"
            : "   curl -fsSL https://tdk-landscape.github.io/install.sh | sh",
        ),
      );
    }
    return false;
  }
}

/** @internal Exported for unit tests only; not part of the package API. */
export async function upgradeViaBun(): Promise<boolean> {
  const spinner = startSpinner("Upgrading via bun...");

  try {
    execFileSync(findOnPath("bun") ?? "bun", ["install", "-g", "@flisk-sh/flisk@latest"], {
      stdio: "inherit",
      timeout: 120000,
    });
    spinner.succeed("Upgraded successfully via bun");
    return true;
  } catch (err: unknown) {
    logVerbose("bun upgrade error", err);
    spinner.fail(`Bun upgrade failed: ${getErrorMessage(err)}`);
    console.log(chalk.yellow("\nTo retry manually, install the latest published Bun release:"));
    console.log(chalk.cyan("   bun install -g @flisk-sh/flisk@latest"));
    return false;
  }
}

/** @internal Exported for unit tests only; not part of the package API. */
export async function upgradeAllInstallations(dryRun: boolean): Promise<boolean> {
  const installations = detectAllInstallations();
  if (!installations.length) {
    console.error(chalk.red("Could not find any Flisk installations on PATH."));
    return false;
  }

  console.log(
    chalk.blue(
      `Found ${installations.length} Flisk installation${installations.length === 1 ? "" : "s"}:`,
    ),
  );
  for (const install of installations) {
    console.log(chalk.gray(`   ${install.method}: ${install.path}`));
  }
  if (dryRun) {
    console.log(chalk.yellow("\nDry run: no installations were changed."));
    return true;
  }

  const binaryInstallations = installations.filter(
    (install) => install.method === "binary" && install.path,
  );
  const release = binaryInstallations.length ? await getLatestBinaryRelease() : null;
  if (binaryInstallations.length && !release) {
    console.error(chalk.red("Could not find a compatible Flisk binary release for this platform."));
    return false;
  }

  let success = true;
  const completed = new Set<string>();
  for (const install of installations) {
    const key =
      install.method === "npm" || install.method === "bun"
        ? install.method
        : `${install.method}:${install.path}`;
    if (completed.has(key)) continue;
    completed.add(key);
    if (install.method === "git" && install.path) {
      console.log(chalk.cyan(`\nUpdating git install at ${install.path}`));
      success = (await upgradeViaGit(install.path)) && success;
    } else if (install.method === "binary" && install.path && release) {
      const latest = release.tag.replace(/^v/, "").split("-")[0];
      let current = "";
      try {
        current = execFileSync(install.path, ["version"], {
          encoding: "utf-8",
          timeout: 10_000,
        }).trim();
      } catch {}
      if (current === latest) {
        console.log(chalk.green(`\n${install.path} is already current (${current}).`));
      } else {
        console.log(chalk.cyan(`\nUpdating ${install.path} (${current || "unknown"} → ${latest})`));
        success = (await upgradeViaBinary(install.path, release)) && success;
      }
    } else if (install.method === "npm") {
      console.log(chalk.cyan("\nUpdating the npm installation..."));
      success = (await upgradeViaNpm()) && success;
    } else if (install.method === "bun") {
      console.log(chalk.cyan("\nUpdating the Bun installation..."));
      success = (await upgradeViaBun()) && success;
    }
  }
  if (success) console.log(chalk.green.bold("\nAll Flisk installations on PATH are up to date."));
  else console.error(chalk.red("\nAt least one Flisk installation could not be updated."));
  return success;
}

/** @internal Exported for unit tests only; not part of the package API. */
export async function upgradeViaGit(path: string): Promise<boolean> {
  const spinner = startSpinner("Updating the git installation from the default branch...");
  let rebaseInProgress = false;

  try {
    execFileSync("git", ["rev-parse", "--git-dir"], {
      cwd: path,
      stdio: "pipe",
    });

    spinner.text = "Fetching from origin...";
    execFileSync("git", ["fetch", "origin"], {
      cwd: path,
      stdio: "pipe",
      timeout: 30000,
    });

    const dirty = execFileSync("git", ["status", "--porcelain"], {
      cwd: path,
      encoding: "utf-8",
    }).trim();
    if (dirty) {
      throw new Error(
        "The Flisk source checkout has local changes. Commit or stash them, then run `flisk upgrade` again.",
      );
    }

    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: path,
      encoding: "utf-8",
    }).trim();

    let defaultRef = "";
    try {
      defaultRef = execFileSync(
        "git",
        ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
        {
          cwd: path,
          encoding: "utf-8",
          stdio: "pipe",
        },
      ).trim();
    } catch {
      for (const candidate of ["origin/main", "origin/master"]) {
        try {
          execFileSync("git", ["rev-parse", "--verify", candidate], { cwd: path, stdio: "pipe" });
          defaultRef = candidate;
          break;
        } catch {}
      }
    }
    if (!defaultRef?.startsWith("origin/")) {
      throw new Error(
        "Could not find the default branch for origin (expected origin/HEAD, origin/main, or origin/master).",
      );
    }
    const defaultBranch = defaultRef.slice("origin/".length);

    if (branch === defaultBranch) {
      spinner.text = `Fast-forwarding ${branch} from origin/${defaultBranch}...`;
      execFileSync("git", ["pull", "--ff-only", "origin", defaultBranch], {
        cwd: path,
        stdio: "pipe",
        timeout: 30000,
      });
    } else {
      spinner.text = `Rebasing ${branch} onto origin/${defaultBranch}...`;
      rebaseInProgress = true;
      execFileSync("git", ["rebase", defaultRef], {
        cwd: path,
        stdio: "pipe",
        timeout: 60000,
      });
      rebaseInProgress = false;
    }

    if (existsSync(join(path, "cli", PACKAGE_JSON))) {
      spinner.text = "Rebuilding CLI...";
      execFileSync(findOnPath("bun") ?? "bun", ["install"], {
        cwd: join(path, "cli"),
        stdio: "pipe",
        timeout: 60000,
      });
      execFileSync(findOnPath("bun") ?? "bun", ["run", "build"], {
        cwd: join(path, "cli"),
        stdio: "pipe",
        timeout: 60000,
      });
    }

    spinner.text = "Re-linking CLI...";
    execFileSync(findOnPath("bun") ?? "bun", ["link", "--force"], {
      cwd: join(path, "cli"),
      stdio: "pipe",
      timeout: 30000,
    });

    spinner.succeed(`Upgraded successfully from origin/${defaultBranch}`);
    return true;
  } catch (err: unknown) {
    if (rebaseInProgress) {
      try {
        execFileSync("git", ["rebase", "--abort"], { cwd: path, stdio: "pipe" });
      } catch {}
    }
    spinner.fail(`Git upgrade failed: ${getErrorMessage(err)}`);
    return false;
  }
}

/** @internal Exported for unit tests only; not part of the package API. */
export function createUpgradeCommand(): Command {
  return addYesOption(new Command("upgrade"))
    .alias("update")
    .description("Upgrade Flisk CLI to the latest version")
    .option("-f, --force", "Upgrade even if already on the latest version", false)
    .option("--all", "Upgrade every Flisk installation found on PATH", false)
    .option("--dry-run", "Show what would be upgraded without actually doing it", false)
    .action(async (options) => {
      console.log(chalk.cyan("🚀 Flisk CLI Upgrade\n"));

      const currentVersion = getCurrentVersion();
      console.log(chalk.gray(`Current version: ${currentVersion}`));

      const installInfo = detectInstallation();
      console.log(chalk.gray(`Installation method: ${installInfo.method}`));
      console.log();

      if (options.all) {
        const installations = detectAllInstallations();
        if (!installations.length) {
          console.error(chalk.red("Could not find any Flisk installations on PATH."));
          process.exit(1);
        }
        if (!options.dryRun && !options.yes) {
          const confirm = await promptConfirm({
            message: `Upgrade all ${installations.length} Flisk installations on PATH?`,
            initial: true,
          });
          if (!confirm) {
            showCancelled();
            process.exit(0);
          }
        }
        const success = await upgradeAllInstallations(options.dryRun);
        if (!success) process.exit(1);
        return;
      }

      const windowsNpmMessage = windowsNpmUpgradeMessage(process.platform, installInfo);
      if (windowsNpmMessage) {
        console.log(windowsNpmMessage);
        return;
      }

      if (installInfo.method === "unknown") {
        console.error(chalk.red("Could not detect installation method"));
        console.log(chalk.yellow("\nManual upgrade using a published package:"));
        console.log(chalk.cyan("   npm install -g @flisk-sh/flisk@latest"));
        console.log(chalk.cyan("   bun install -g @flisk-sh/flisk@latest"));
        console.log(chalk.cyan("   git:  cd /path/to/tdk-cli && git pull && bun link --force"));
        process.exit(1);
      }

      let latestVersion: string | null = null;
      let binaryRelease: BinaryRelease | null = null;

      if (installInfo.method === "binary" && installInfo.path) {
        console.log(chalk.blue("📦 Standalone binary installation detected"));

        binaryRelease = await getLatestBinaryRelease();

        if (!binaryRelease) {
          if (process.platform === "win32" && process.arch === "arm64") {
            showErrorAndExit(
              "Flisk Windows v1 supports AMD64 only. Use WSL2 Ubuntu or a 64-bit Intel/AMD PC.",
            );
          }
          if (process.platform === "win32") {
            showErrorAndExit(
              "No Windows AMD64 binary in this Flisk release. Need asset flisk-windows-amd64.exe.",
            );
          }
          showErrorAndExit(
            `Unsupported OS: Flisk does not support this OS: ${process.platform}. Supported: linux, darwin, win32.`,
          );
        }

        latestVersion = binaryRelease.tag.replace(/^v/, "").split("-")[0];

        if (latestVersion === currentVersion && !options.force) {
          console.log(chalk.green("\n✅ You are already on the latest version!"));
          console.log(chalk.gray(`   ${currentVersion} (current) = ${latestVersion} (latest)`));
          process.exit(0);
        }

        if (latestVersion !== currentVersion) {
          console.log(chalk.yellow(`\n⬆️  Upgrade available: ${currentVersion} → ${latestVersion}`));
        } else if (options.force) {
          console.log(chalk.yellow(`\n🔄 Force upgrade requested (currently ${currentVersion})`));
        }
      } else if (installInfo.method === "git" && installInfo.path) {
        console.log(
          chalk.blue("📦 Git installation detected - will update from origin's default branch"),
        );

        try {
          execFileSync("git", ["fetch", "origin"], { cwd: installInfo.path, stdio: "pipe" });
          const localHash = execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: installInfo.path,
            encoding: "utf-8",
          }).trim();
          const remoteHash = execFileSync("git", ["rev-parse", "origin/main"], {
            cwd: installInfo.path,
            encoding: "utf-8",
          }).trim();

          if (localHash === remoteHash && !options.force) {
            console.log(chalk.green("\n✅ Already up to date with origin/main!"));
            console.log(chalk.gray(`   Current: ${localHash.substring(0, 7)}`));
            console.log(chalk.gray("\n   Tip: Use --force to pull and rebuild anyway"));
            process.exit(0);
          }

          if (localHash !== remoteHash) {
            console.log(chalk.yellow(`\n⬆️  Updates available:`));
            console.log(chalk.gray(`   Local:  ${localHash.substring(0, 7)}`));
            console.log(chalk.gray(`   Remote: ${remoteHash.substring(0, 7)}`));
          } else {
            console.log(chalk.yellow(`\n🔄 Force upgrade requested`));
          }

          latestVersion = remoteHash.substring(0, 7);
        } catch (err: unknown) {
          console.warn(chalk.yellow("⚠️  Could not check git remote, will attempt upgrade anyway"));
          logVerbose("Git remote check failed", err);
          latestVersion = "latest";
        }
      } else {
        latestVersion = await getLatestVersion();

        if (!latestVersion) {
          showErrorAndExit("Could not determine latest version");
        }

        if (currentVersion === latestVersion && !options.force) {
          console.log(chalk.green("\n✅ You are already on the latest version!"));
          console.log(chalk.gray(`   ${currentVersion} (current) = ${latestVersion} (latest)`));
          process.exit(0);
        }

        if (currentVersion !== latestVersion) {
          console.log(chalk.yellow(`\n⬆️  Upgrade available: ${currentVersion} → ${latestVersion}`));
        } else if (options.force) {
          console.log(chalk.yellow(`\n🔄 Force upgrade requested (currently ${currentVersion})`));
        }
      }

      // The plan is a method and action list, not the standard pair, so it supplies its own printer.
      if (
        handleDryRun(options, "", "", () => {
          console.log(chalk.blue("\n📋 Dry run mode - would perform:"));
          console.log(chalk.gray(`   Method: ${installInfo.method}`));
          if (installInfo.path) {
            console.log(chalk.gray(`   Path: ${installInfo.path}`));
          }
          if (installInfo.method === "git") {
            console.log(
              chalk.gray("   Action: fetch origin, update from origin/HEAD, rebuild, and relink"),
            );
          } else if (installInfo.method === "binary" && binaryRelease) {
            console.log(
              chalk.gray(`   Action: Download and replace with ${binaryRelease.downloadUrl}`),
            );
            console.log(
              chalk.gray(
                `   Action: Refresh bundled engine from ${binaryRelease.engineDownloadUrl}`,
              ),
            );
          } else {
            console.log(chalk.gray(`   Action: Upgrade to ${latestVersion}`));
          }
          console.log(chalk.yellow("\n   (Not actually upgrading due to --dry-run)"));
        })
      ) {
        process.exit(0);
      }

      if (!options.yes) {
        console.log();
        const confirm = await promptConfirm({
          message: "Proceed with upgrade?",
          initial: true,
        });

        if (!confirm) {
          showCancelled();
          process.exit(0);
        }
      } else {
        console.log(chalk.gray("⚡ Auto-confirming (--yes flag)\n"));
      }

      console.log();

      let success = false;

      switch (installInfo.method) {
        case "npm":
          success = await upgradeViaNpm();
          break;
        case "bun":
          success = await upgradeViaBun();
          break;
        case "git":
          if (installInfo.path) {
            success = await upgradeViaGit(installInfo.path);
          }
          break;
        case "binary":
          if (installInfo.path && binaryRelease) {
            success = await upgradeViaBinary(installInfo.path, binaryRelease);
          }
          break;
      }

      if (!success) {
        console.error(chalk.red("\nUpgrade failed"));
        if (installInfo.method === "git") {
          console.log(
            chalk.cyan(`   Check local changes with: git -C ${installInfo.path} status --short`),
          );
          console.log(chalk.cyan("   Commit or stash them, then retry: flisk upgrade"));
        } else if (installInfo.method === "binary" && binaryRelease && installInfo.path) {
          const engineDir = join(dirname(installInfo.path), "tdk-cli");
          if (isWindows()) {
            console.log(chalk.cyan("   irm https://tdk-landscape.github.io/install.ps1 | iex"));
          } else {
            console.log(
              chalk.cyan(`   curl -fsSL -o ${installInfo.path} ${binaryRelease.downloadUrl}`),
            );
            console.log(chalk.cyan(`   chmod +x ${installInfo.path}`));
            console.log(chalk.cyan(`   rm -rf ${engineDir} && mkdir -p ${engineDir}`));
            console.log(
              chalk.cyan(
                `   curl -fsSL ${binaryRelease.engineDownloadUrl} | tar -xzf - -C ${engineDir} --strip-components=1`,
              ),
            );
          }
        }
        process.exit(1);
      }

      console.log();
      const verifySpinner = startSpinner("Verifying upgrade...");

      try {
        const newVersion = execFileSync(
          findOnPath(executableName()) ?? executableName(),
          ["version"],
          {
            encoding: "utf-8",
            windowsHide: isWindows(),
          },
        ).trim();
        verifySpinner.succeed(`Verified: now running ${chalk.green(newVersion)}`);

        console.log();
        console.log(chalk.green.bold("✨ Upgrade complete!"));
        console.log(chalk.gray(`   Version: ${currentVersion} → ${newVersion}`));

        console.log();
        console.log(chalk.cyan.bold("📍 Installation Details:"));
        if (installInfo.method === "git" && installInfo.path) {
          console.log(chalk.gray(`   Location: ${installInfo.path}`));
          console.log(chalk.gray(`   Method:   git clone + bun link`));
        } else {
          console.log(chalk.gray(`   Method:   ${installInfo.method}`));
        }
        console.log(
          chalk.gray(
            `   Binary:   ${installInfo.path ?? findOnPath(executableName()) ?? "unknown"}`,
          ),
        );

        console.log();
        console.log(chalk.cyan.bold("🚀 Quick Start:"));
        console.log(chalk.white(`   flisk --help         Show all commands`));
        console.log(chalk.white(`   flisk networks       View service URLs`));
        console.log(chalk.white(`   flisk doctor         Check environment`));

        if (newVersion === currentVersion && !options.force) {
          console.log();
          console.log(
            chalk.yellow(
              "💡 Tip: Version appears unchanged. You may need to restart your terminal.",
            ),
          );
        }

        console.log();
        console.log(chalk.green("Happy coding! 🎉"));
      } catch (err: unknown) {
        verifySpinner.warn("Could not verify new version");
        console.error(chalk.red(`Verification error: ${getErrorMessage(err)}`));
        console.log();
        console.log(chalk.yellow("⚠️  Upgrade status unknown - verification failed"));
        console.log();
        if (isPermissionError(err) && installInfo.method !== "git" && installInfo.path) {
          console.log(chalk.yellow("💡 The installed binary isn't executable. Fix it with:"));
          console.log(chalk.cyan(`   chmod +x ${installInfo.path}`));
          console.log(chalk.white("   then run: flisk version"));
        } else {
          console.log(chalk.yellow("💡 Verify manually:"));
          console.log(chalk.white("   1. Restart your terminal"));
          console.log(chalk.white("   2. Run: flisk version"));
          if (installInfo.method === "git" && installInfo.path) {
            console.log(
              chalk.white(`   3. Compare with: git -C ${installInfo.path} rev-parse HEAD`),
            );
          }
        }
      }
    });
}

export const upgradeCommand = createUpgradeCommand();
