import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  startSpinner
} from "./chunk-NLPSJJBC.js";
import {
  LEGACY_PACKAGE
} from "./chunk-UJEJFGPG.js";
import {
  extractTarball
} from "./chunk-NRF42HAR.js";
import {
  addYesOption,
  handleDryRun
} from "./chunk-MJGDAK6E.js";
import {
  createMachineEnvelope,
  writeMachineError
} from "./chunk-3SNMUNQF.js";
import {
  promptConfirm
} from "./chunk-3EZ4UDYT.js";
import {
  showCancelled
} from "./chunk-ARPSTQFE.js";
import {
  FliskError,
  PACKAGE_JSON,
  binaryAssetName,
  executableName,
  findAllOnPath,
  findOnPath,
  getErrorMessage,
  getPackageVersion,
  isWindows,
  logVerbose,
  showErrorAndExit,
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/commands/upgrade.js
import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, chmodSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
var __fliskModuleUrl = new URL("../dist/commands/upgrade.js", import.meta.url).href;
function managedMethodForPath(path) {
  if (path.includes("/Cellar/flisk/"))
    return "homebrew";
  if (/[\\/]scoop[\\/](apps[\\/]flisk|shims)[\\/]/i.test(path))
    return "scoop";
  return null;
}
function managedUpgradeMessage(installInfo) {
  if (installInfo.method === "homebrew") {
    return "Flisk was installed with Homebrew. Upgrade it with: brew upgrade flisk";
  }
  if (installInfo.method === "scoop") {
    return "Flisk was installed with Scoop. Upgrade it with: scoop update flisk";
  }
  return null;
}
function isStandaloneBinary(fliskPath) {
  if (isWindows() && fliskPath.toLowerCase().endsWith(".exe"))
    return true;
  try {
    const fileInfo = execFileSync("file", ["-b", fliskPath], { encoding: "utf-8" });
    return /Mach-O|ELF/.test(fileInfo);
  } catch (err) {
    logVerbose("Binary detection (file command) error", err);
    return false;
  }
}
function classifyRunningInstall(execPath, scriptPath, platformName = process.platform) {
  const runningName = (platformName === "win32" ? win32.basename(execPath) : basename(execPath)).toLowerCase();
  if (runningName === "flisk" || runningName === "flisk.exe") {
    return { method: managedMethodForPath(execPath) ?? "binary", path: execPath };
  }
  if (runningName === "node" || runningName === "node.exe") {
    const normalizedScriptPath = scriptPath.toLowerCase();
    if (normalizedScriptPath.includes("node_modules") || normalizedScriptPath.includes(".npm")) {
      return { method: "npm", path: scriptPath };
    }
  }
  return null;
}
function windowsNpmUpgradeMessage(platformName, installInfo) {
  return platformName === "win32" && installInfo.method === "npm" ? "use npm install -g @flisk-sh/flisk@latest" : null;
}
function packageManagerForPath(path) {
  if (path.includes(".bun"))
    return "bun";
  if (path.includes("node_modules") || path.includes(".npm"))
    return "npm";
  return null;
}
function detectInstallation() {
  const runningPath = process.execPath;
  const runningInstall = classifyRunningInstall(runningPath, process.argv[1] ?? "");
  if (runningInstall)
    return runningInstall;
  try {
    const fliskPath = findOnPath(executableName());
    if (!fliskPath)
      return { method: "unknown" };
    const realPath = realpathSync(fliskPath);
    const managedMethod = managedMethodForPath(realPath);
    if (managedMethod)
      return { method: managedMethod, path: realPath };
    if (realPath.includes("flisk-cli")) {
      const possibleGitRoot = resolve(realPath, "..", "..", "..");
      if (existsSync(join(possibleGitRoot, ".git"))) {
        return { method: "git", path: possibleGitRoot };
      }
    }
    const packageManager = packageManagerForPath(fliskPath) ?? packageManagerForPath(realPath);
    if (packageManager) {
      return { method: packageManager, path: fliskPath };
    }
    const cliRoot = resolve(dirname(fileURLToPath(__fliskModuleUrl)), "..", "..", "..");
    if (existsSync(join(cliRoot, ".git"))) {
      return { method: "git", path: cliRoot };
    }
    if (isStandaloneBinary(realPath)) {
      return { method: "binary", path: realPath };
    }
    return { method: "unknown", path: fliskPath };
  } catch (err) {
    console.warn(source_default.yellow("\u26A0\uFE0F Could not detect installation method"));
    logVerbose("Installation detection error", err);
    return { method: "unknown" };
  }
}
function detectInstallationForPath(fliskPath) {
  try {
    const realPath = realpathSync(fliskPath);
    const managedMethod = managedMethodForPath(realPath);
    if (managedMethod)
      return { method: managedMethod, path: realPath };
    if (realPath.includes("flisk-cli")) {
      const possibleGitRoot = resolve(realPath, "..", "..", "..");
      if (existsSync(join(possibleGitRoot, ".git"))) {
        return { method: "git", path: possibleGitRoot };
      }
    }
    const packageManager = packageManagerForPath(fliskPath) ?? packageManagerForPath(realPath);
    if (packageManager)
      return { method: packageManager, path: fliskPath };
    if (isStandaloneBinary(realPath))
      return { method: "binary", path: realPath };
  } catch (err) {
    logVerbose(`Installation detection failed for ${fliskPath}`, err);
  }
  return { method: "unknown", path: fliskPath };
}
function detectAllInstallations() {
  const candidates = findAllOnPath(executableName()).map(detectInstallationForPath);
  const current = detectInstallation();
  if (current.method !== "unknown")
    candidates.unshift(current);
  const unique = /* @__PURE__ */ new Map();
  for (const install of candidates) {
    if (install.method === "unknown" || !install.path)
      continue;
    let key = install.path;
    try {
      if (install.method === "binary")
        key = realpathSync(install.path);
    } catch {
    }
    unique.set(`${install.method}:${key}`, install);
  }
  return [...unique.values()];
}
var BINARY_RELEASE_REPO = "flisk-sh/releases";
var ENGINE_ASSET_NAME = "flisk-cli-engine.tar.gz";
var CHECKSUMS_ASSET_NAME = "checksums.txt";
var CHECKSUMS_BUNDLE_ASSET_NAME = `${CHECKSUMS_ASSET_NAME}.sigstore.json`;
var REQUIRE_SIGNATURE_ENV = "FLISK_UPGRADE_REQUIRE_SIGNATURE";
var FIRST_SIGNED_VERSION = [1, 3, 130];
var SIGNATURE_CHECK_TIMEOUT_MS = 6e4;
function isSignedRelease(tag) {
  const match = tag.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match)
    return true;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3])];
  for (let i = 0; i < 3; i++) {
    const have = parts[i] ?? 0;
    const want = FIRST_SIGNED_VERSION[i] ?? 0;
    if (have !== want)
      return have > want;
  }
  return true;
}
var SIGNER_IDENTITY = /^https:\/\/github\.com\/flisk-sh\/flisk\/\.github\/workflows\/(release-binaries|sign-release)\.yml@.*$/;
var SIGNER_ISSUER = "https://token.actions.githubusercontent.com";
function parseChecksums(text) {
  const sums = /* @__PURE__ */ new Map();
  for (const line of text.split("\n")) {
    const match = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    if (match) {
      const [, hash, name] = match;
      if (hash && name)
        sums.set(name.trim(), hash.toLowerCase());
    }
  }
  return sums;
}
function verifyChecksum(filePath, assetName, sums, required) {
  const expected = sums.get(assetName);
  if (!expected) {
    if (required)
      throw new FliskError(`${CHECKSUMS_ASSET_NAME} has no entry for ${assetName}`, [
        "Run flisk upgrade again once the release has finished publishing",
        "Or install with: npm install -g @flisk-sh/flisk"
      ]);
    logVerbose(`${CHECKSUMS_ASSET_NAME} has no entry for ${assetName}; skipping verification`);
    return;
  }
  const actual = createHash("sha256").update(readFileSync(filePath)).digest("hex");
  if (actual !== expected) {
    throw new FliskError(`${isWindows() ? "checksum mismatch" : "Checksum mismatch"} for ${assetName} (expected ${expected}, got ${actual})`, [
      "Run flisk upgrade again; an interrupted download fails this check",
      "Or install with: npm install -g @flisk-sh/flisk"
    ]);
  }
}
async function verifyChecksumsSignature(checksums, bundleUrl, tag) {
  const mustBeSigned = isSignedRelease(tag);
  const required = mustBeSigned || process.env[REQUIRE_SIGNATURE_ENV] === "1";
  const response = await fetch(bundleUrl, { signal: AbortSignal.timeout(3e4) });
  if (response.status === 404) {
    if (required)
      throw new FliskError(mustBeSigned ? `Release ${tag} has no signature (${CHECKSUMS_BUNDLE_ASSET_NAME}), but every release since v1.3.130 is signed` : `Release ${tag} has no signature (${CHECKSUMS_BUNDLE_ASSET_NAME}) and ${REQUIRE_SIGNATURE_ENV}=1 is set`, [
        mustBeSigned ? "Do not install this release; report it at https://github.com/flisk-sh/flisk/security" : "Upgrade to a signed release, or unset FLISK_UPGRADE_REQUIRE_SIGNATURE",
        "Or install with: npm install -g @flisk-sh/flisk"
      ]);
    console.warn(source_default.yellow(`Warning: this release has no signature for ${CHECKSUMS_ASSET_NAME}; verifying checksums only. Set ${REQUIRE_SIGNATURE_ENV}=1 to refuse unsigned releases.`));
    return false;
  }
  if (!response.ok)
    throw new FliskError(`Signature download failed (${response.status})`, [
      "Check your network connection and run flisk upgrade again",
      "Or install with: npm install -g @flisk-sh/flisk"
    ]);
  const fail = (reason) => new FliskError(`Signature verification failed for ${CHECKSUMS_ASSET_NAME}: ${reason}`, [
    "Nothing was installed. Do not use this release; report it at https://github.com/flisk-sh/flisk/security",
    "Or install with: npm install -g @flisk-sh/flisk"
  ]);
  let signer;
  let timer;
  try {
    const bundle = JSON.parse(await response.text());
    const { verify } = await import("sigstore");
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("timed out"), { code: "TUF_TIMEOUT" })), SIGNATURE_CHECK_TIMEOUT_MS);
    });
    signer = await Promise.race([
      verify(bundle, checksums, { certificateIssuer: SIGNER_ISSUER, timeout: 3e4 }),
      timeout
    ]);
  } catch (err) {
    const code = err?.code;
    if (typeof code === "string" && code.startsWith("TUF_"))
      throw new FliskError(`Could not fetch the Sigstore trust root needed to verify ${CHECKSUMS_ASSET_NAME}: ${getErrorMessage(err)}`, [
        "Nothing was installed. Check your network connection (tuf-repo-cdn.sigstore.dev) and run flisk upgrade again",
        `The signature check is never skipped, and ${REQUIRE_SIGNATURE_ENV} does not bypass it`,
        "Or install with: npm install -g @flisk-sh/flisk"
      ]);
    throw fail(getErrorMessage(err));
  } finally {
    clearTimeout(timer);
  }
  const identity = signer.identity?.subjectAlternativeName ?? "";
  if (!SIGNER_IDENTITY.test(identity))
    throw fail(`unexpected signer identity "${identity}"`);
  return true;
}
async function getLatestBinaryRelease() {
  const assetName = binaryAssetName();
  if (!assetName)
    return null;
  try {
    const response = await fetch(`https://api.github.com/repos/${BINARY_RELEASE_REPO}/releases/latest`, {
      signal: AbortSignal.timeout(1e4)
    });
    if (!response.ok)
      return null;
    const data = await response.json();
    if (!data.tag_name)
      return null;
    return {
      tag: data.tag_name,
      assetName,
      downloadUrl: `https://github.com/${BINARY_RELEASE_REPO}/releases/download/${data.tag_name}/${assetName}`,
      engineDownloadUrl: `https://github.com/${BINARY_RELEASE_REPO}/releases/download/${data.tag_name}/${ENGINE_ASSET_NAME}`,
      checksumsUrl: `https://github.com/${BINARY_RELEASE_REPO}/releases/download/${data.tag_name}/${CHECKSUMS_ASSET_NAME}`,
      checksumsBundleUrl: `https://github.com/${BINARY_RELEASE_REPO}/releases/download/${data.tag_name}/${CHECKSUMS_BUNDLE_ASSET_NAME}`
    };
  } catch (err) {
    logVerbose("Binary release lookup error", err);
    return null;
  }
}
function isPermissionError(err) {
  const code = err?.code;
  return code === "EACCES" || code === "EPERM";
}
function isWritable(path) {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
async function upgradeViaBinary(fliskPath, release) {
  const installDir = dirname(fliskPath);
  if (!isWritable(installDir)) {
    console.log(source_default.yellow(`
\u{1F512} ${installDir} isn't writable by your user.`));
    console.log(source_default.yellow("\u{1F4A1} Upgrade manually instead:"));
    if (isWindows()) {
      console.log(source_default.cyan("   Install Flisk in a user-writable directory, then retry the upgrade."));
    } else {
      console.log(source_default.cyan(`   curl -fsSL -o ${fliskPath} ${release.downloadUrl}`));
      console.log(source_default.cyan(`   chmod +x ${fliskPath}`));
    }
    return false;
  }
  const spinner = startSpinner(`Downloading ${release.assetName} (${release.tag})...`);
  const tempDir = join(installDir, `.flisk-upgrade-${process.pid}-${Date.now()}`);
  const tmpPath = join(tempDir, release.assetName);
  const engineTmpPath = join(tempDir, "engine.tar.gz");
  const engineDir = join(installDir, "flisk-cli");
  const engineStageDir = join(tempDir, "flisk-cli");
  const binaryBackup = join(tempDir, `${basename(fliskPath)}.previous`);
  const engineBackup = join(tempDir, "flisk-cli.previous");
  try {
    mkdirSync(tempDir, { recursive: true });
    const binaryResponse = await fetch(release.downloadUrl, {
      signal: AbortSignal.timeout(12e4)
    });
    if (!binaryResponse.ok)
      throw new FliskError(`Download failed (${binaryResponse.status})`, [
        "Check your network connection and run flisk upgrade again",
        "Or install with: npm install -g @flisk-sh/flisk"
      ]);
    writeFileSync(tmpPath, Buffer.from(await binaryResponse.arrayBuffer()));
    spinner.text = `Downloading bundled engine (${release.tag})...`;
    const engineResponse = await fetch(release.engineDownloadUrl, {
      signal: AbortSignal.timeout(12e4)
    });
    if (!engineResponse.ok)
      throw new FliskError(`Engine download failed (${engineResponse.status})`, [
        "Check your network connection and run flisk upgrade again",
        "Or install with: npm install -g @flisk-sh/flisk"
      ]);
    const engineBuffer = Buffer.from(await engineResponse.arrayBuffer());
    writeFileSync(engineTmpPath, engineBuffer);
    spinner.text = `Verifying checksums (${release.tag})...`;
    const checksumResponse = await fetch(release.checksumsUrl, {
      signal: AbortSignal.timeout(3e4)
    });
    if (!checksumResponse.ok)
      throw new FliskError(`Checksum download failed (${checksumResponse.status})`, [
        "Check your network connection and run flisk upgrade again",
        "Or install with: npm install -g @flisk-sh/flisk"
      ]);
    const checksumBytes = Buffer.from(await checksumResponse.arrayBuffer());
    spinner.text = `Verifying signature (${release.tag})...`;
    await verifyChecksumsSignature(checksumBytes, release.checksumsBundleUrl, release.tag);
    const sums = parseChecksums(checksumBytes.toString("utf8"));
    verifyChecksum(tmpPath, release.assetName, sums, true);
    verifyChecksum(engineTmpPath, ENGINE_ASSET_NAME, sums, false);
    if (!isWindows())
      chmodSync(tmpPath, 493);
    mkdirSync(engineStageDir, { recursive: true });
    extractTarball(engineBuffer, engineStageDir);
    if (existsSync(fliskPath))
      renameSync(fliskPath, binaryBackup);
    try {
      renameSync(tmpPath, fliskPath);
    } catch (err) {
      if (existsSync(binaryBackup))
        renameSync(binaryBackup, fliskPath);
      throw err;
    }
    if (existsSync(engineDir))
      renameSync(engineDir, engineBackup);
    try {
      renameSync(engineStageDir, engineDir);
    } catch (err) {
      if (existsSync(engineBackup))
        renameSync(engineBackup, engineDir);
      if (existsSync(binaryBackup)) {
        rmSync(fliskPath, { force: true });
        renameSync(binaryBackup, fliskPath);
      }
      throw err;
    }
    rmSync(binaryBackup, { force: true });
    rmSync(engineBackup, { recursive: true, force: true });
    spinner.succeed(`Upgraded to ${release.tag}`);
    return true;
  } catch (err) {
    spinner.fail(`Binary upgrade failed: ${getErrorMessage(err)}`);
    logVerbose("Binary upgrade error", err);
    console.log(source_default.yellow("\n\u{1F4A1} If this failed due to permissions, use the platform installer or install command."));
    return false;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
function getCurrentVersion() {
  try {
    return getPackageVersion();
  } catch (err) {
    logVerbose("Version detection error", err);
    return "unknown";
  }
}
async function getLatestVersion(options = {}) {
  const quiet = options.quiet === true;
  const spinner = quiet ? null : startSpinner("Checking for latest version...");
  try {
    let result;
    if (isWindows()) {
      const response = await fetch("https://registry.npmjs.org/@flisk-sh%2fflisk/latest", {
        signal: AbortSignal.timeout(1e4)
      });
      if (!response.ok)
        throw new FliskError(`npm registry returned ${response.status}`, [
          "Check your network connection and npm registry access",
          "Run: npm view @flisk-sh/flisk version"
        ]);
      const latest = await response.json();
      result = latest.version ?? "";
      if (!result)
        throw new FliskError("npm registry response did not include a version", [
          "Run: npm view @flisk-sh/flisk version"
        ]);
    } else {
      result = execSync("npm view @flisk-sh/flisk version", {
        encoding: "utf-8",
        timeout: 1e4
      }).trim();
    }
    spinner?.succeed(`Latest version: ${source_default.green(result)}`);
    return result;
  } catch (err) {
    logVerbose("npm registry check failed", err);
    if (!quiet) {
      spinner?.warn("Could not check the npm registry");
      console.log(source_default.yellow("\nInstall the latest published release manually:"));
      console.log(source_default.cyan("   npm install -g @flisk-sh/flisk@latest"));
      console.log(source_default.cyan("   bun install -g @flisk-sh/flisk@latest"));
    }
    return null;
  }
}
function removeLegacyInstallation(manager) {
  const command = manager === "npm" ? `npm uninstall -g ${LEGACY_PACKAGE}` : `bun remove -g ${LEGACY_PACKAGE}`;
  try {
    execSync(command, { stdio: ["ignore", "ignore", "ignore"], timeout: 6e4 });
  } catch {
  }
}
async function upgradeViaNpm() {
  const spinner = startSpinner("Upgrading via npm...");
  try {
    removeLegacyInstallation("npm");
    execSync("npm install -g @flisk-sh/flisk@latest", {
      stdio: ["inherit", "inherit", "pipe"],
      timeout: 12e4
    });
    spinner.succeed("Upgraded successfully via npm");
    return true;
  } catch (err) {
    const errorStderr = err && typeof err === "object" && "stderr" in err ? String(err.stderr ?? "") : "";
    if (errorStderr)
      process.stderr.write(errorStderr);
    logVerbose("npm upgrade error", err);
    spinner.fail(`npm upgrade failed: ${getErrorMessage(err)}`);
    console.log(source_default.yellow("\nTo retry manually, install the latest published npm release:"));
    console.log(source_default.cyan("   npm install -g @flisk-sh/flisk@latest"));
    const errorCode = err && typeof err === "object" && "code" in err ? String(err.code ?? "") : "";
    if (/EACCES|EPERM|permission denied/i.test(`${errorCode} ${getErrorMessage(err)} ${errorStderr}`)) {
      console.log(source_default.gray("\nFor EACCES or EPERM, fix npm's global prefix or use the binary installer:"));
      console.log(source_default.cyan("   https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally/"));
      console.log(source_default.cyan(isWindows() ? "   irm https://flisk.sh/install.ps1 | iex" : "   curl -fsSL https://flisk.sh/install.sh | sh"));
    }
    return false;
  }
}
async function upgradeViaBun() {
  const spinner = startSpinner("Upgrading via bun...");
  try {
    removeLegacyInstallation("bun");
    execFileSync(findOnPath("bun") ?? "bun", ["install", "-g", "@flisk-sh/flisk@latest"], {
      stdio: "inherit",
      timeout: 12e4
    });
    spinner.succeed("Upgraded successfully via bun");
    return true;
  } catch (err) {
    logVerbose("bun upgrade error", err);
    spinner.fail(`Bun upgrade failed: ${getErrorMessage(err)}`);
    console.log(source_default.yellow("\nTo retry manually, install the latest published Bun release:"));
    console.log(source_default.cyan("   bun install -g @flisk-sh/flisk@latest"));
    return false;
  }
}
async function upgradeAllInstallations(dryRun) {
  const installations = detectAllInstallations();
  if (!installations.length) {
    console.error(source_default.red("Could not find any Flisk installations on PATH."));
    return false;
  }
  console.log(source_default.blue(`Found ${installations.length} Flisk installation${installations.length === 1 ? "" : "s"}:`));
  for (const install of installations) {
    console.log(source_default.gray(`   ${install.method}: ${install.path}`));
  }
  if (dryRun) {
    console.log(source_default.yellow("\nDry run: no installations were changed."));
    return true;
  }
  const binaryInstallations = installations.filter((install) => install.method === "binary" && install.path);
  const release = binaryInstallations.length ? await getLatestBinaryRelease() : null;
  if (binaryInstallations.length && !release) {
    console.error(source_default.red("Could not find a compatible Flisk binary release for this platform."));
    return false;
  }
  let success = true;
  const completed = /* @__PURE__ */ new Set();
  for (const install of installations) {
    const key = install.method === "npm" || install.method === "bun" ? install.method : `${install.method}:${install.path}`;
    if (completed.has(key))
      continue;
    completed.add(key);
    if (install.method === "git" && install.path) {
      console.log(source_default.cyan(`
Updating git install at ${install.path}`));
      success = await upgradeViaGit(install.path) && success;
    } else if (install.method === "binary" && install.path && release) {
      const latest = release.tag.replace(/^v/, "").split("-")[0];
      let current = "";
      try {
        current = execFileSync(install.path, ["version"], {
          encoding: "utf-8",
          timeout: 1e4
        }).trim();
      } catch {
      }
      if (current === latest) {
        console.log(source_default.green(`
${install.path} is already current (${current}).`));
      } else {
        console.log(source_default.cyan(`
Updating ${install.path} (${current || "unknown"} \u2192 ${latest})`));
        success = await upgradeViaBinary(install.path, release) && success;
      }
    } else if (install.method === "npm") {
      console.log(source_default.cyan("\nUpdating the npm installation..."));
      success = await upgradeViaNpm() && success;
    } else if (install.method === "bun") {
      console.log(source_default.cyan("\nUpdating the Bun installation..."));
      success = await upgradeViaBun() && success;
    } else if (install.method === "homebrew" || install.method === "scoop") {
      console.log(source_default.yellow(`
${install.path}: ${managedUpgradeMessage(install)}`));
    }
  }
  if (success)
    console.log(source_default.green.bold("\nAll Flisk installations on PATH are up to date."));
  else
    console.error(source_default.red("\nAt least one Flisk installation could not be updated."));
  return success;
}
function resolveGitDefaultRef(path) {
  let defaultRef = "";
  try {
    defaultRef = execFileSync("git", ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], {
      cwd: path,
      encoding: "utf-8",
      stdio: "pipe"
    }).trim();
  } catch {
    for (const candidate of ["origin/main", "origin/master"]) {
      try {
        execFileSync("git", ["rev-parse", "--verify", candidate], { cwd: path, stdio: "pipe" });
        defaultRef = candidate;
        break;
      } catch {
      }
    }
  }
  if (!defaultRef?.startsWith("origin/")) {
    throw new FliskError("Could not find the default branch for origin (expected origin/HEAD, origin/main, or origin/master).", ["git remote set-head origin --auto", "flisk upgrade"]);
  }
  return defaultRef;
}
async function upgradeViaGit(path) {
  const spinner = startSpinner("Updating the git installation from the default branch...");
  let rebaseInProgress = false;
  try {
    execFileSync("git", ["rev-parse", "--git-dir"], {
      cwd: path,
      stdio: "pipe"
    });
    spinner.text = "Fetching from origin...";
    execFileSync("git", ["fetch", "origin"], {
      cwd: path,
      stdio: "pipe",
      timeout: 3e4
    });
    const dirty = execFileSync("git", ["status", "--porcelain"], {
      cwd: path,
      encoding: "utf-8"
    }).trim();
    if (dirty) {
      throw new FliskError("The Flisk source checkout has local changes. Commit or stash them, then run `flisk upgrade` again.", ["git stash", "flisk upgrade"]);
    }
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: path,
      encoding: "utf-8"
    }).trim();
    const defaultRef = resolveGitDefaultRef(path);
    const defaultBranch = defaultRef.slice("origin/".length);
    if (branch === defaultBranch) {
      spinner.text = `Fast-forwarding ${branch} from origin/${defaultBranch}...`;
      execFileSync("git", ["pull", "--ff-only", "origin", defaultBranch], {
        cwd: path,
        stdio: "pipe",
        timeout: 3e4
      });
    } else {
      spinner.text = `Rebasing ${branch} onto origin/${defaultBranch}...`;
      rebaseInProgress = true;
      execFileSync("git", ["rebase", defaultRef], {
        cwd: path,
        stdio: "pipe",
        timeout: 6e4
      });
      rebaseInProgress = false;
    }
    if (existsSync(join(path, "cli", PACKAGE_JSON))) {
      spinner.text = "Rebuilding CLI...";
      execFileSync(findOnPath("bun") ?? "bun", ["install"], {
        cwd: join(path, "cli"),
        stdio: "pipe",
        timeout: 6e4
      });
      execFileSync(findOnPath("bun") ?? "bun", ["run", "build"], {
        cwd: join(path, "cli"),
        stdio: "pipe",
        timeout: 6e4
      });
    }
    spinner.text = "Re-linking CLI...";
    execFileSync(findOnPath("bun") ?? "bun", ["link", "--force"], {
      cwd: join(path, "cli"),
      stdio: "pipe",
      timeout: 3e4
    });
    spinner.succeed(`Upgraded successfully from origin/${defaultBranch}`);
    return true;
  } catch (err) {
    if (rebaseInProgress) {
      try {
        execFileSync("git", ["rebase", "--abort"], { cwd: path, stdio: "pipe" });
      } catch {
      }
    }
    spinner.fail(`Git upgrade failed: ${getErrorMessage(err)}`);
    return false;
  }
}
async function resolveUpgradeDryRunVersion(installInfo, currentVersion) {
  if (installInfo.method === "binary" && installInfo.path) {
    const release = await getLatestBinaryRelease();
    if (!release) {
      if (binaryAssetName()) {
        throw new FliskError("Could not look up the latest Flisk binary release.", [
          "Check your network connection and retry: flisk upgrade --dry-run --json",
          "Or install manually: npm install -g @flisk-sh/flisk@latest"
        ]);
      }
      if (process.platform === "win32" && process.arch === "arm64") {
        throw new FliskError("Flisk Windows v1 supports AMD64 only. Use WSL2 Ubuntu or a 64-bit Intel/AMD PC.", ["Run flisk upgrade inside WSL2 Ubuntu or on a 64-bit Intel/AMD PC"]);
      }
      if (process.platform === "win32") {
        throw new FliskError("No Windows AMD64 binary in this Flisk release. Need asset flisk-windows-amd64.exe.", ["Run: irm https://flisk.sh/install.ps1 | iex"]);
      }
      throw new FliskError(`Unsupported OS: Flisk does not support this OS: ${process.platform}. Supported: linux, darwin, win32.`, ["Install via npm install -g @flisk-sh/flisk@latest"]);
    }
    const latestVersion2 = release.tag.replace(/^v/, "").split("-")[0] ?? release.tag;
    return { latestVersion: latestVersion2, upgradeAvailable: latestVersion2 !== currentVersion };
  }
  if (installInfo.method === "git" && installInfo.path) {
    const gitPath = installInfo.path;
    try {
      execFileSync("git", ["fetch", "origin"], { cwd: gitPath, stdio: "pipe", timeout: 3e4 });
      const defaultRef = resolveGitDefaultRef(gitPath);
      const localHash = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: gitPath,
        encoding: "utf-8"
      }).trim();
      const remoteHash = execFileSync("git", ["rev-parse", defaultRef], {
        cwd: gitPath,
        encoding: "utf-8"
      }).trim();
      const latestVersion2 = remoteHash.substring(0, 7);
      return { latestVersion: latestVersion2, upgradeAvailable: localHash !== remoteHash };
    } catch (err) {
      logVerbose("Git remote check failed", err);
      if (err instanceof FliskError)
        throw err;
      throw new FliskError(`Could not check the git installation for updates: ${getErrorMessage(err)}`, [
        "Check your network connection and retry: flisk upgrade --dry-run --json",
        "Or check the checkout manually: git fetch origin"
      ]);
    }
  }
  const latestVersion = await getLatestVersion({ quiet: true });
  if (!latestVersion) {
    throw new FliskError("Could not determine latest version", [
      "Check your network connection and retry: flisk upgrade --dry-run --json",
      "Or install manually: npm install -g @flisk-sh/flisk@latest"
    ]);
  }
  return { latestVersion, upgradeAvailable: latestVersion !== currentVersion };
}
async function runUpgradeJson(options) {
  if (!options.dryRun) {
    writeMachineError(new FliskError("`flisk upgrade --json` requires `--dry-run` so an upgrade never runs silently", ["Run: flisk upgrade --dry-run --json", "Or run without --json: flisk upgrade"]));
  }
  const currentVersion = getCurrentVersion();
  let effective;
  let installations;
  if (options.all) {
    const allDetected = detectAllInstallations();
    if (allDetected.length === 0) {
      writeMachineError(new FliskError("Could not find any Flisk installations on PATH.", [
        "Install with: npm install -g @flisk-sh/flisk@latest",
        "Or install with: bun install -g @flisk-sh/flisk@latest"
      ]));
    }
    installations = allDetected.map((item) => ({
      method: item.method,
      path: item.path ?? ""
    }));
    const primary = detectInstallation();
    effective = primary.method !== "unknown" ? primary : allDetected[0];
  } else {
    const installInfo = detectInstallation();
    if (installInfo.method === "unknown") {
      writeMachineError(new FliskError("Could not detect installation method", [
        "npm install -g @flisk-sh/flisk@latest",
        "bun install -g @flisk-sh/flisk@latest"
      ]));
    }
    effective = installInfo;
    installations = installInfo.path ? [{ method: installInfo.method, path: installInfo.path }] : [];
  }
  let latestVersion = null;
  let upgradeAvailable = false;
  try {
    const resolved = await resolveUpgradeDryRunVersion(effective, currentVersion);
    latestVersion = resolved.latestVersion;
    upgradeAvailable = resolved.upgradeAvailable;
  } catch (err) {
    if (!options.all)
      writeMachineError(err);
    logVerbose("Version check failed during --all --dry-run --json", err);
  }
  console.log(JSON.stringify(createMachineEnvelope({
    dryRun: true,
    currentVersion,
    latestVersion,
    upgradeAvailable,
    method: effective.method,
    path: effective.path ?? null,
    installations
  })));
  process.exit(0);
}
function createUpgradeCommand() {
  return addYesOption(new Command("upgrade")).alias("update").description("Upgrade Flisk CLI to the latest version").option("-f, --force", "Upgrade even if already on the latest version", false).option("--all", "Upgrade every Flisk installation found on PATH", false).option("--dry-run", "Show what would be upgraded without actually doing it", false).option("--json", "Print the dry-run result as a JSON envelope", false).addHelpText("after", "\nExamples:\n  flisk upgrade\n  flisk upgrade --dry-run\n  flisk upgrade --dry-run --json\n  flisk upgrade --all").action(async (options) => {
    if (options.json) {
      await runUpgradeJson(options);
      return;
    }
    console.log(source_default.cyan("\u{1F680} Flisk CLI Upgrade\n"));
    const currentVersion = getCurrentVersion();
    console.log(source_default.gray(`Current version: ${currentVersion}`));
    const installInfo = detectInstallation();
    console.log(source_default.gray(`Installation method: ${installInfo.method}`));
    console.log();
    if (options.all) {
      const installations = detectAllInstallations();
      if (!installations.length) {
        console.error(source_default.red("Could not find any Flisk installations on PATH."));
        process.exit(1);
      }
      if (!options.dryRun && !options.yes) {
        const confirm = await promptConfirm({
          message: `Upgrade all ${installations.length} Flisk installations on PATH?`,
          initial: true
        });
        if (!confirm) {
          showCancelled();
          process.exit(0);
        }
      }
      const success2 = await upgradeAllInstallations(options.dryRun);
      if (!success2)
        process.exit(1);
      return;
    }
    const windowsNpmMessage = windowsNpmUpgradeMessage(process.platform, installInfo);
    if (windowsNpmMessage) {
      console.log(windowsNpmMessage);
      return;
    }
    const managedMessage = managedUpgradeMessage(installInfo);
    if (managedMessage) {
      console.log(managedMessage);
      return;
    }
    if (installInfo.method === "unknown") {
      console.error(source_default.red("Could not detect installation method"));
      console.log(source_default.yellow("\nManual upgrade using a published package:"));
      console.log(source_default.cyan("   npm install -g @flisk-sh/flisk@latest"));
      console.log(source_default.cyan("   bun install -g @flisk-sh/flisk@latest"));
      console.log(source_default.cyan("   git:  cd /path/to/flisk-cli && git pull && bun link --force"));
      console.log(source_default.yellow("\nTo remove Flisk (run the one you installed with, or both):"));
      console.log(source_default.cyan("   npm uninstall -g @flisk-sh/flisk"));
      console.log(source_default.cyan("   bun remove -g @flisk-sh/flisk"));
      process.exit(1);
    }
    let latestVersion = null;
    let binaryRelease = null;
    if (installInfo.method === "binary" && installInfo.path) {
      console.log(source_default.blue("\u{1F4E6} Standalone binary installation detected"));
      binaryRelease = await getLatestBinaryRelease();
      if (!binaryRelease) {
        if (process.platform === "win32" && process.arch === "arm64") {
          showErrorAndExit("Flisk Windows v1 supports AMD64 only. Use WSL2 Ubuntu or a 64-bit Intel/AMD PC.");
        }
        if (process.platform === "win32") {
          showErrorAndExit("No Windows AMD64 binary in this Flisk release. Need asset flisk-windows-amd64.exe.");
        }
        showErrorAndExit(`Unsupported OS: Flisk does not support this OS: ${process.platform}. Supported: linux, darwin, win32.`);
      }
      latestVersion = binaryRelease.tag.replace(/^v/, "").split("-")[0] ?? binaryRelease.tag;
      if (latestVersion === currentVersion && !options.force) {
        console.log(source_default.green("\n\u2705 You are already on the latest version!"));
        console.log(source_default.gray(`   ${currentVersion} (current) = ${latestVersion} (latest)`));
        process.exit(0);
      }
      if (latestVersion !== currentVersion) {
        console.log(source_default.yellow(`
\u2B06\uFE0F  Upgrade available: ${currentVersion} \u2192 ${latestVersion}`));
      } else if (options.force) {
        console.log(source_default.yellow(`
\u{1F504} Force upgrade requested (currently ${currentVersion})`));
      }
    } else if (installInfo.method === "git" && installInfo.path) {
      console.log(source_default.blue("\u{1F4E6} Git installation detected - will update from origin's default branch"));
      try {
        execFileSync("git", ["fetch", "origin"], { cwd: installInfo.path, stdio: "pipe" });
        const localHash = execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: installInfo.path,
          encoding: "utf-8"
        }).trim();
        const remoteHash = execFileSync("git", ["rev-parse", "origin/main"], {
          cwd: installInfo.path,
          encoding: "utf-8"
        }).trim();
        if (localHash === remoteHash && !options.force) {
          console.log(source_default.green("\n\u2705 Already up to date with origin/main!"));
          console.log(source_default.gray(`   Current: ${localHash.substring(0, 7)}`));
          console.log(source_default.gray("\n   Tip: Use --force to pull and rebuild anyway"));
          process.exit(0);
        }
        if (localHash !== remoteHash) {
          console.log(source_default.yellow(`
\u2B06\uFE0F  Updates available:`));
          console.log(source_default.gray(`   Local:  ${localHash.substring(0, 7)}`));
          console.log(source_default.gray(`   Remote: ${remoteHash.substring(0, 7)}`));
        } else {
          console.log(source_default.yellow(`
\u{1F504} Force upgrade requested`));
        }
        latestVersion = remoteHash.substring(0, 7);
      } catch (err) {
        console.warn(source_default.yellow("\u26A0\uFE0F  Could not check git remote, will attempt upgrade anyway"));
        logVerbose("Git remote check failed", err);
        latestVersion = "latest";
      }
    } else {
      latestVersion = await getLatestVersion();
      if (!latestVersion) {
        showErrorAndExit("Could not determine latest version");
      }
      if (currentVersion === latestVersion && !options.force) {
        console.log(source_default.green("\n\u2705 You are already on the latest version!"));
        console.log(source_default.gray(`   ${currentVersion} (current) = ${latestVersion} (latest)`));
        process.exit(0);
      }
      if (currentVersion !== latestVersion) {
        console.log(source_default.yellow(`
\u2B06\uFE0F  Upgrade available: ${currentVersion} \u2192 ${latestVersion}`));
      } else if (options.force) {
        console.log(source_default.yellow(`
\u{1F504} Force upgrade requested (currently ${currentVersion})`));
      }
    }
    if (handleDryRun(options, "", "", () => {
      console.log(source_default.blue("\n\u{1F4CB} Dry run mode - would perform:"));
      console.log(source_default.gray(`   Method: ${installInfo.method}`));
      if (installInfo.path) {
        console.log(source_default.gray(`   Path: ${installInfo.path}`));
      }
      if (installInfo.method === "git") {
        console.log(source_default.gray("   Action: fetch origin, update from origin/HEAD, rebuild, and relink"));
      } else if (installInfo.method === "binary" && binaryRelease) {
        console.log(source_default.gray(`   Action: Download and replace with ${binaryRelease.downloadUrl}`));
        console.log(source_default.gray(`   Action: Refresh bundled engine from ${binaryRelease.engineDownloadUrl}`));
      } else {
        console.log(source_default.gray(`   Action: Upgrade to ${latestVersion}`));
      }
      console.log(source_default.yellow("\n   (Not actually upgrading due to --dry-run)"));
    })) {
      process.exit(0);
    }
    if (!options.yes) {
      console.log();
      const confirm = await promptConfirm({
        message: "Proceed with upgrade?",
        initial: true
      });
      if (!confirm) {
        showCancelled();
        process.exit(0);
      }
    } else {
      console.log(source_default.gray("\u26A1 Auto-confirming (--yes flag)\n"));
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
      console.error(source_default.red("\nUpgrade failed"));
      if (installInfo.method === "git") {
        console.log(source_default.cyan(`   Check local changes with: git -C ${installInfo.path} status --short`));
        console.log(source_default.cyan("   Commit or stash them, then retry: flisk upgrade"));
      } else if (installInfo.method === "binary" && binaryRelease && installInfo.path) {
        const engineDir = join(dirname(installInfo.path), "flisk-cli");
        if (isWindows()) {
          console.log(source_default.cyan("   irm https://flisk.sh/install.ps1 | iex"));
        } else {
          console.log(source_default.cyan(`   curl -fsSL -o ${installInfo.path} ${binaryRelease.downloadUrl}`));
          console.log(source_default.cyan(`   chmod +x ${installInfo.path}`));
          console.log(source_default.cyan(`   rm -rf ${engineDir} && mkdir -p ${engineDir}`));
          console.log(source_default.cyan(`   curl -fsSL ${binaryRelease.engineDownloadUrl} | tar -xzf - -C ${engineDir} --strip-components=1`));
        }
      }
      process.exit(1);
    }
    console.log();
    const verifySpinner = startSpinner("Verifying upgrade...");
    try {
      const newVersion = execFileSync(findOnPath(executableName()) ?? executableName(), ["version"], {
        encoding: "utf-8",
        windowsHide: isWindows()
      }).trim();
      verifySpinner.succeed(`Verified: now running ${source_default.green(newVersion)}`);
      console.log();
      console.log(source_default.green.bold("\u2728 Upgrade complete!"));
      console.log(source_default.gray(`   Version: ${currentVersion} \u2192 ${newVersion}`));
      console.log();
      console.log(source_default.cyan.bold("\u{1F4CD} Installation Details:"));
      if (installInfo.method === "git" && installInfo.path) {
        console.log(source_default.gray(`   Location: ${installInfo.path}`));
        console.log(source_default.gray(`   Method:   git clone + bun link`));
      } else {
        console.log(source_default.gray(`   Method:   ${installInfo.method}`));
      }
      console.log(source_default.gray(`   Binary:   ${installInfo.path ?? findOnPath(executableName()) ?? "unknown"}`));
      console.log();
      console.log(source_default.cyan.bold("\u{1F680} Quick Start:"));
      console.log(source_default.white(`   flisk --help         Show all commands`));
      console.log(source_default.white(`   flisk networks       View service URLs`));
      console.log(source_default.white(`   flisk doctor         Check environment`));
      if (newVersion === currentVersion && !options.force) {
        console.log();
        console.log(source_default.yellow("\u{1F4A1} Tip: Version appears unchanged. You may need to restart your terminal."));
      }
      console.log();
      console.log(source_default.green("Happy coding! \u{1F389}"));
    } catch (err) {
      verifySpinner.warn("Could not verify new version");
      console.error(source_default.red(`Verification error: ${getErrorMessage(err)}`));
      console.log();
      console.log(source_default.yellow("\u26A0\uFE0F  Upgrade status unknown - verification failed"));
      console.log();
      if (isPermissionError(err) && installInfo.method !== "git" && installInfo.path) {
        console.log(source_default.yellow("\u{1F4A1} The installed binary isn't executable. Fix it with:"));
        console.log(source_default.cyan(`   chmod +x ${installInfo.path}`));
        console.log(source_default.white("   then run: flisk version"));
      } else {
        console.log(source_default.yellow("\u{1F4A1} Verify manually:"));
        console.log(source_default.white("   1. Restart your terminal"));
        console.log(source_default.white("   2. Run: flisk version"));
        if (installInfo.method === "git" && installInfo.path) {
          console.log(source_default.white(`   3. Compare with: git -C ${installInfo.path} rev-parse HEAD`));
        }
      }
    }
  });
}
var upgradeCommand = createUpgradeCommand();

export {
  managedUpgradeMessage,
  isStandaloneBinary,
  classifyRunningInstall,
  windowsNpmUpgradeMessage,
  detectInstallation,
  detectInstallationForPath,
  detectAllInstallations,
  parseChecksums,
  verifyChecksumsSignature,
  getLatestBinaryRelease,
  isPermissionError,
  isWritable,
  upgradeViaBinary,
  getCurrentVersion,
  getLatestVersion,
  upgradeViaNpm,
  upgradeViaBun,
  upgradeAllInstallations,
  upgradeViaGit,
  createUpgradeCommand,
  upgradeCommand
};
